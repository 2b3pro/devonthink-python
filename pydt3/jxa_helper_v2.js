/**
 * ObjectPoolManager handles the lifecycle of JXA objects in memory.
 * It maintains a mapping between object IDs and their instances to enable
 * reference tracking and garbage collection.
 */
class ObjectPoolManager {
    constructor() {
        this._currentId = 0;  // Counter for generating unique object IDs
        this._objectIdMap = new Map();  // Maps objects to their IDs
        this._idObjectMap = new Map();  // Maps IDs to their objects
    }

    /**
     * Retrieves an object by its ID from the pool
     * @param {number} id - The object's unique identifier
     * @returns {Object} The stored object instance
     */
    getObject(id) {
        try {
            return this._idObjectMap.get(id);
        } catch (error) {
            console.log(`Error getting object with id: ${id}`);
        }
     }

    /**
     * Gets or assigns a unique ID for an object
     * @param {Object} obj - The object to track
     * @returns {number} The object's unique identifier
     */
    getId(obj) {
        if (!this._objectIdMap.has(obj)) {
            this._currentId += 1;
            this._objectIdMap.set(obj, this._currentId);
            this._idObjectMap.set(this._currentId, obj);
        }
        return this._currentId;
    }

    /**
     * Removes an object from the pool by its ID
     * @param {number} objectId - ID of the object to release
     */
    releaseObjectWithId(objectId) {
        const obj = this.getObject(objectId);
        this._idObjectMap.delete(objectId);
        this._objectIdMap.delete(obj);
    }
}

/**
 * Utility class providing helper methods for JXA operations
 */
class Util {
    /**
     * Extracts the application name from an object's automation string
     * @param {Object} obj - The JXA object
     * @returns {string|null} The application name or null
     */
    static getAssociatedApplicationName(obj) {
        let displayString = Automation.getDisplayString(obj);
        let m = displayString.match(/^Application\(['"]([^)]*)['"]\)/);
        if (m) {
            let name = m[1];
            return name;
        }
        return null;
    }

    /**
     * Determines if a specifier represents a container (array-like object)
     * @param {Object} specifier - The object specifier to check
     * @returns {boolean} True if the specifier is a container
     */
    static guessIsSpecifierContainer(specifier) {
        if (!ObjectSpecifier.hasInstance(specifier)) {
            return false;
        }
        let proto = Object.getPrototypeOf(specifier);
        const testPropNames = ['whose', 'at'];
        return testPropNames.every((propName) => propName in proto);
    }

    /**
     * Attempts to determine the class type of a specifier object
     * @param {Object} specifier - The object specifier to analyze
     * @returns {string|undefined} The determined class name or undefined
     */
    static guessClassOfSpecifier(specifier) {
        if (!ObjectSpecifier.hasInstance(specifier)) {
            return undefined;
        }
        let specifierClass = undefined;
        let classOf = ObjectSpecifier.classOf(specifier);
        if (classOf === 'application') {
            return 'application';
        }
        if (this.guessIsSpecifierContainer(specifier)) {
            return 'array::' + classOf;
        }
        if (specifier.class !== undefined) {
            try {
                specifierClass = specifier.class();
            } catch (e) {
                if (e.errorNumber === -1700) {
                    return classOf;
                }
            }
            return specifierClass;
        }
        return classOf;
    }

    /**
     * Checks if a value is a JSON primitive type
     * @param {*} obj - Value to check
     * @returns {boolean} True if the value is a JSON primitive
     */
    static isJsonNode(obj) {
        return obj === null || ['undefined', 'string', 'number', 'boolean'].includes(typeof obj);
    }

    /**
     * Checks if an object is a plain JSON object (no complex types)
     * @param {*} obj - Object to check
     * @returns {boolean} True if the object is plain JSON
     */
    static isPlainJson(obj) {
        if (this.isJsonNode(obj)) {
            return true;
        } else if (typeof obj === 'object') {
            for (let k in obj) {
                if (!this.isJsonNode(obj[k])) {
                    return false;
                }
            }
            return true;
        } else if (typeof obj === 'function') {
            return false;
        }
    }

    /**
     * Checks if an object is a method
     * @param {*} obj - Object to check
     * @returns {boolean} True if the object is a method
     */
    static isMethod(obj) {
        return typeof obj === 'function' && obj.constructor.name === 'Function';
    }
}

/**
 * Handles conversion between JXA objects and JSON for Python communication
 */
class JsonTranslator {
    /**
     * @param {ObjectPoolManager} objectPoolManager - The object pool to use
     */
    constructor(objectPoolManager) {
        this.objectPoolManager = objectPoolManager;
    }

    /**
     * Converts a JXA object to a JSON representation
     * @param {*} obj - The object to convert
     * @returns {Object} JSON representation of the object
     */
    wrapToJson(obj) {
        if (obj === undefined) {
            obj = null;
        }

        if (Util.isJsonNode(obj)) {
            return {
                type: 'plain',
                data: obj
            }
        }

        if (ObjectSpecifier.hasInstance(obj)) {
            let guessClass = Util.guessClassOfSpecifier(obj);
            if (guessClass === undefined) {
                return {
                    type: 'reference',
                    objId: this.objectPoolManager.getId(obj),
                    app: Util.getAssociatedApplicationName(obj),
                    className: 'unknown'
                }
                // We don't do implicit evaluation of specifiers anymore.
                
                // The object is a specifier but we don't know its class.
                // This could mean that the object is a reference to a primitive value.
                // eg. a `number`, `bool` or `string`.
                // In that case, the best we can do is to return the evaluated value.
                // try {
                //     let evaluated = obj();
                //     if (Util.isJsonNode(evaluated)) {
                //         return {
                //             type: 'plain',
                //             data: evaluated
                //         };
                //     } else if (evaluated instanceof Date) {
                //         return {
                //             type: 'date',
                //             data: evaluated.getTime() / 1000
                //         }
                //     } else {
                //         return {
                //             type: 'reference',
                //             objId: this.objectPoolManager.getId(obj),
                //             app: Util.getAssociatedApplicationName(obj),
                //             className: 'unknown'
                //         }
                //     }
                // } catch (error) {
                //     return {
                //         type: 'reference',
                //         objId: this.objectPoolManager.getId(obj),
                //         app: Util.getAssociatedApplicationName(obj),
                //         className: 'unknown'
                //     }
                // }
            }

            if (guessClass === 'application') {
                return {
                    type: 'reference',
                    objId: this.objectPoolManager.getId(obj),
                    app: Util.getAssociatedApplicationName(obj),
                    className: 'application'
                }
            }

            if (guessClass.startsWith('array::')) {
                return {
                    type: 'reference',
                    objId: this.objectPoolManager.getId(obj),
                    app: Util.getAssociatedApplicationName(obj),
                    className: guessClass
                }
            }

            return {
                type: 'reference',
                objId: this.objectPoolManager.getId(obj),
                className: guessClass,
                app: Util.getAssociatedApplicationName(obj),
            }
        }

        if (typeof obj === 'object') {
            if (obj instanceof Date) {
                return {
                    type: 'date',
                    data: obj.getTime() / 1000
                }
            }
            if (Array.isArray(obj)) {
                let data = []
                for (let i in obj) {
                    data[i] = this.wrapToJson(obj[i]);
                }
                return {
                    type: 'array',
                    data: data
                }
            }
            if (obj.constructor.name === 'Object') {
                let data = {}
                for (let k in obj) {
                    data[k] = this.wrapToJson(obj[k]);
                }
                return {
                    type: 'dict',
                    data: data
                }
            }

            throw new Error(`wrapObjToJson: Unknown type: ${typeof obj}`);
        }

        if (typeof obj === 'function') {
            return {
                type: 'reference',
                objId: this.objectPoolManager.getId(obj),
                className: 'function'
            }
        }

        throw new Error(`Unknown type: ${typeof obj}`);
    }

    /**
     * Converts a JSON representation back to a JXA object
     * @param {Object} obj - The JSON object to convert
     * @returns {*} The restored JXA object
     */
    unwrapFromJson(obj) {
        if (obj.type === 'plain') {
            return obj.data;
        } else if (obj.type === 'date') {
            return new Date(obj.data * 1000);
        } else if (obj.type === 'array' || obj.type === 'dict') {
            for (let k in obj.data) {
                obj.data[k] = this.unwrapFromJson(obj.data[k]);
            }
            return obj.data;
        } else if (obj.type === 'reference') {
            try {
                return this.objectPoolManager.getObject(obj.objId);
            } catch (error) {
                console.log(`Error unwrapping object with id: ${obj.objId}`);
            }
        }
    }

    /**
     * Wraps a function to handle JSON string I/O
     * @param {Function} func - Function to wrap
     * @returns {Function} Wrapped function that handles JSON conversion
     */
    strIOFuncWrapper(func) {
        return  (strParams) => {
            let params = JSON.parse(strParams);
            try {
                params = this.unwrapFromJson(params);
            } catch (error) {
                console.log(`Error unwrapping params: ${error}`);
            }
            let result = func(params);
            try {
                result = this.wrapToJson(result);
            } catch (error) {
                console.log(`Error wrapping result: ${error}`);
            }
            return JSON.stringify(result);
        }
    }
}

// Create global instances used by the bridge functions
const objectPoolManager = new ObjectPoolManager();
const jsonTranslator = new JsonTranslator(objectPoolManager);

/**
 * Echo function for testing the bridge
 * @param {*} params - Parameters to echo back
 * @returns {*} The same parameters
 */
function _echo(params) {
    return params;
}
echo = jsonTranslator.strIOFuncWrapper(_echo);

/**
 * Releases an object from the pool
 * @param {Object} param0 - Object containing the ID to release
 */
function _releaseObjectWithId({id}) {
    objectPoolManager.releaseObjectWithId(id);
}
releaseObjectWithId = jsonTranslator.strIOFuncWrapper(_releaseObjectWithId);

/**
 * Creates a new application instance
 * @param {Object} param0 - Object containing the application name
 * @returns {Object} The application instance
 */
function _getApplication({name}) {
    let theApp = Application(name);
    theApp.includeStandardAdditions = true
    return theApp;
}
getApplication = jsonTranslator.strIOFuncWrapper(_getApplication);

/**
 * Evaluates a JXA code snippet with optional local variables
 * @param {Object} param0 - Object containing source code and locals
 * @returns {*} Result of the evaluation
 */
function _evalJXACodeSnippet({source, locals}) {
    for (let k in locals) {
        eval(`var ${k} = locals[k];`);
    }
    const value = eval(source);
    return value;
}
evalJXACodeSnippet = jsonTranslator.strIOFuncWrapper(_evalJXACodeSnippet);

/**
 * Evaluates an AppleScript code snippet
 * @param {Object} param0 - Object containing the source code
 * @returns {*} Result of the evaluation
 */
function _evalAppleScriptCodeSnippet({source}) {
    let app = Application.currentApplication();
    app.includeStandardAdditions = true;

    let result = app.runScript(source, {in: 'AppleScript'});
    return result;
}
evalAppleScriptCodeSnippet = jsonTranslator.strIOFuncWrapper(_evalAppleScriptCodeSnippet);

/**
 * Gets a property value from an object
 * @param {Object} param0 - Object containing target and property name
 * @returns {*} The property value
 */
function _getProperty({obj, name}) {
    let value = obj[name];
    if (Util.isMethod(value)) {
        value = value.bind(obj);
    }
    return value;
}
getProperty = jsonTranslator.strIOFuncWrapper(_getProperty);

/**
 * Gets multiple property values from an object
 * @param {Object} param0 - Object containing target and property names
 * @returns {Object} Object containing the property values
 */
function _getProperties({obj, properties}) {
    let result = {};
    for (let k of properties) {
        result[k] = _getProperty({obj, name: k});
    }
    return result;
}
getProperties = jsonTranslator.strIOFuncWrapper(_getProperties);

/**
 * Sets multiple property values on an object
 * @param {Object} param0 - Object containing target and key-value pairs
 */
function _setProperties({obj, keyValues}) {
    for (let k in keyValues) {
        obj[k] = keyValues[k];
    }
}
setProperties = jsonTranslator.strIOFuncWrapper(_setProperties);

/**
 * Calls a method on an object
 * @param {Object} param0 - Object containing target, method name, and arguments
 * @returns {*} Result of the method call
 */
function _callMethod({obj, name, args, kwargs}) {
    let method = obj[name];
    if (method === undefined) {
        throw new Error(`Method not found: ${name}`);
    }
    if (Util.isMethod(method)) {
        method = method.bind(obj);
    }
    if (args === null || args === undefined) {
        args = [];
    }

    if (kwargs === null || kwargs === undefined) {
        return method(...args);
    } else {
        return method(...args, kwargs);
    }
}
callMethod = jsonTranslator.strIOFuncWrapper(_callMethod);

/**
 * Calls an object as a function
 * @param {Object} param0 - Object containing target and arguments
 * @returns {*} Result of the function call
 */
function _callSelf({obj, args, kwargs}) {
    return obj(...args, kwargs);
}
callSelf = jsonTranslator.strIOFuncWrapper(_callSelf);
