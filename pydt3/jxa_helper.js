/**
 * This file provides JavaScript for Automation (JXA) helper functions for bridging
 * between Python and macOS applications. It handles object serialization, method calls,
 * and reference management for JXA objects.
 */

/**
 * Creates a unique ID generator with closure scope
 * @returns {Function} Function that generates unique IDs for objects
 */
const getObjectId = (() => {
    let count = 0;  // Counter for generating unique IDs
    const objIdMap = new WeakMap();  // Maps objects to their IDs using weak references
    return (object) => {
      const objectId = objIdMap.get(object);
      if (objectId === undefined) {
        count += 1;
        objIdMap.set(object, count);
        return count;
      }
      return objectId;
    }
})();

// Global object cache for storing JXA objects by their IDs
const objectCacheMap = {};

/**
 * Stores an object in the cache and returns its ID
 * @param {Object} obj - Object to cache
 * @returns {number} The object's unique ID
 */
function cacheObjct(obj) {
    let id = getObjectId(obj);
    objectCacheMap[id] = obj;
    return id;
}

/**
 * Retrieves an object from the cache by its ID
 * @param {number} id - ID of the object to retrieve
 * @returns {Object} The cached object
 */
function getCachedObject(id) {
    return objectCacheMap[id];
}

/**
 * Wraps a function to handle JSON string I/O
 * @param {Function} func - Function to wrap
 * @returns {Function} Wrapped function that handles JSON conversion
 */
function jsonIOWrapper(func) {
    return (param_str) => {
        let param = JSON.parse(param_str);
        let result = func(param);
        return JSON.stringify(result);
    }
}

/**
 * Creates a cached application getter
 * @returns {Function} Function that returns cached application instances
 */
const getAssociatedApplication = (() => {
    const appCache = {};  // Cache for application instances
    return function getAssociatedApplication(obj) {
        let displayString = Automation.getDisplayString(obj);
        let m = displayString.match(/^Application\(['"]([^)]*)['"]\)/);
        if (m) {
            let name = m[1];
            if (appCache[name] === undefined) {
                appCache[name] = Application(name);
            }
            return appCache[name];
        }
        return null;
    }
})();

/**
 * Checks if a specifier represents a container (array-like object)
 * @param {Object} specifier - Specifier to check
 * @returns {boolean} True if specifier is a container
 */
function guessIsContainerSpecifier(specifier) {
    if (!ObjectSpecifier.hasInstance(specifier)) {
        return false;
    }
    let proto = Object.getPrototypeOf(specifier);
    const testPropNames = ['whose', 'at'];
    return testPropNames.every((propName) => propName in proto);
}

/**
 * Attempts to determine the class type of a specifier
 * @param {Object} specifier - Specifier to analyze
 * @returns {string|undefined} The determined class name
 */
function guessClassOfSpecifier(specifier) {
    if (!ObjectSpecifier.hasInstance(specifier)) {
        return undefined;
    }
    let specifierClass = undefined;
    if (guessIsContainerSpecifier(specifier)) {
        specifierClass = ObjectSpecifier.classOf(specifier);
        return 'array::' + specifierClass;
    }
    try {
        specifierClass = specifier.class();
    } catch (e) {
        if (e.errorNumber === -1700) {
            return undefined;
        }
    }
    return specifierClass;
}

/**
 * Checks if a value is a JSON primitive
 * @param {*} obj - Value to check
 * @returns {boolean} True if value is a JSON primitive
 */
function isJsonNodeValue(obj) {
    return obj === null || ['undefined', 'string', 'number', 'boolean'].includes(typeof obj);
}

/**
 * Checks if an object is a plain JSON object
 * @param {*} obj - Object to check
 * @returns {boolean} True if object is plain JSON
 */
function isPlainObj(obj) {
    if (isJsonNodeValue(obj)) {
        return true;
    } else if (typeof obj === 'object') {
        for (let k in obj) {
            if (!isJsonNodeValue(obj[k])) {
                return false;
            }
        }
        return true;
    } else if (typeof obj === 'function') {
        return false;
    }
}

/**
 * Converts a JXA object to a JSON representation
 * @param {*} obj - Object to convert
 * @returns {Object} JSON representation of the object
 */
function wrapObjToJson(obj) {
    if (obj === undefined) {
        obj = null;
    }
    if (isJsonNodeValue(obj)) {
        return {
            type: 'plain',
            data: obj
        }
    }

    if (typeof obj === 'object') {
        // Handle Date objects
        if (obj instanceof Date) {
            return {
                type: 'date',
                data: obj.getTime() / 1000
            }
        }
        // Handle Arrays
        if (Array.isArray(obj)) {
            let data = []
            for (let i in obj) {
                data[i] = wrapObjToJson(obj[i]);
            }
            return {
                type: 'array',
                data: data
            }
        }
        // Handle plain objects
        if (obj.constructor.name === 'Object') {
            let data = {}
            for (let k in obj) {
                data[k] = wrapObjToJson(obj[k]);
            }
            return {
                type: 'dict',
                data: data
            }
        }

        throw new Error(`wrapObjToJson: Unknown type: ${typeof obj}`);
    }

    // Handle JXA object specifiers
    if (ObjectSpecifier.hasInstance(obj)) {
        let guessClass = guessClassOfSpecifier(obj);
        if (guessClass === undefined) {
            // If we can't determine the class, try to evaluate the specifier
            let evaluated = obj();
            return wrapObjToJson(evaluated);
        }

        if (guessClass === 'application') {
            return {
                type: 'reference',
                objId: cacheObjct(obj),
                plainRepr: null,
                className: 'application'
            }
        }

        if (guessClass.startsWith('array::')) {
            return {
                type: 'reference',
                objId: cacheObjct(obj),
                plainRepr: null,
                className: guessClass
            }
        }

        // Try to evaluate the object to get a plain representation
        let evaluated = obj();
        if (!isPlainObj(evaluated)) {
            evaluated = null;
        }

        return {
            type: 'reference',
            objId: cacheObjct(obj),
            className: guessClass,
            plainRepr: evaluated
        }
    }

    // Handle functions
    if (typeof obj === 'function') {
        return {
            type: 'reference',
            objId: cacheObjct(obj),
            className: 'function'
        }
    }

    throw new Error(`Unknown type: ${typeof obj}`);
}

/**
 * Converts a JSON representation back to a JXA object
 * @param {Object} obj - JSON object to convert
 * @returns {*} The restored JXA object
 */
function unwrapObjFromJson(obj) {
    if (obj.type === 'plain') {
        return obj.data;
    } else if (obj.type === 'date') {
        return new Date(obj.data * 1000);
    } else if (obj.type === 'array' || obj.type === 'dict') {
        for (let k in obj.data) {
            obj.data[k] = unwrapObjFromJson(obj.data[k]);
        }
        return obj.data;
    } else if (obj.type === 'reference') {
        return getCachedObject(obj.objId);
    }
}

/**
 * Bridge Functions
 * These functions provide the interface between Python and JXA
 */

function _echo(params) {
    return params;
}
echo = jsonIOWrapper(_echo);

function _releaseObjectWithId({id}) {
    delete objectCacheMap[id];
}
releaseObjectWithId = jsonIOWrapper(_releaseObjectWithId);

function _getApplication({name}) {
    let app = Application(name);
    app.includeStandardAdditions = true
    return app;
}
getApplication = jsonIOWrapper(_getApplication);

function _evalJXACodeSnippet({source, locals}) {
    for (let k in locals) {
        eval(`var ${k} = locals[k];`);
    }
    const value = eval(source);
    return value;
}
evalJXACodeSnippet = jsonIOWrapper(_evalJXACodeSnippet);

function _evalAppleScriptCodeSnippet({source}) {
    let app = Application.currentApplication();
    app.includeStandardAdditions = true;
    let result = app.runScript(source, {in: 'AppleScript'});
    return result;
}
evalAppleScriptCodeSnippet = jsonIOWrapper(_evalAppleScriptCodeSnippet);

function _getProperty({obj, name}) {
    let value = obj[name];
    if (Util.isMethod(value)) {
        value = value.bind(obj);
    }
    return value;
}
getProperty = jsonIOWrapper(_getProperty);

function _getProperties({obj, properties}) {
    let result = {};
    for (let k of properties) {
        result[k] = _getProperty({obj, name: k});
    }
    return result;
}
getProperties = jsonIOWrapper(_getProperties);

function _setProperties({obj, keyValues}) {
    for (let k in keyValues) {
        obj[k] = keyValues[k];
    }
}
setProperties = jsonIOWrapper(_setProperties);

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
callMethod = jsonIOWrapper(_callMethod);

function _callSelf({obj, args, kwargs}) {
    return obj(...args, kwargs);
}
callSelf = jsonIOWrapper(_callSelf);
