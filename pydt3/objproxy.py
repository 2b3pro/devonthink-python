from __future__ import annotations

import logging

from typing import Any, Optional, TypeVar, Sequence, TYPE_CHECKING


if TYPE_CHECKING:
    from .helper_bridging import HelperScript

logger = logging.getLogger(__name__)

class OSAObjProxy:
    """Base class for proxying OSA (Open Scripting Architecture) objects.
    
    This class provides the foundation for interacting with Apple Script/JXA objects
    from Python, handling reference counting and basic object operations.
    """
    
    def __init__(self, helper_script: Optional[HelperScript] = None, obj_id: Optional[int] = None, class_name: Optional[str] = None):
        """Initialize an OSA object proxy.
        
        Args:
            helper_script: Script handler for JXA communication
            obj_id: Unique identifier for the OSA object
            class_name: Name of the OSA object's class
        """
        self._helper_script: Optional[HelperScript] = helper_script
        self.obj_id: Optional[int] = obj_id
        self.class_name: Optional[str] = class_name
        # Increment reference count when object is created
        if self.obj_id is not None:
            self._increase_reference_count()

    def _increase_reference_count(self):
        """Increment the reference count for this object.
        
        Used to track when the object can be safely released in the JXA runtime.
        """
        obj_id = self.obj_id
        if self.obj_id is None:
            raise ValueError('obj_id is None')
        self._helper_script._osaobj_rc.setdefault(obj_id, 0)
        self._helper_script._osaobj_rc[obj_id] += 1
    
    def _decrease_reference_count(self):
        """Decrement the reference count for this object.
        
        When count reaches 0, the object is released from the JXA runtime.
        """
        obj_id = self.obj_id
        if self.obj_id is None:
            raise ValueError('obj_id is None')
        self._helper_script._osaobj_rc.setdefault(obj_id, 0)
        self._helper_script._osaobj_rc[obj_id] -= 1
        logger.debug(f'decrease reference count for {obj_id}, current count: {self._helper_script._osaobj_rc[obj_id]}')
        if self._helper_script._osaobj_rc[obj_id] <= 0:
            self._helper_script.release_object_with_id(obj_id)
    
    def bind(self, script: HelperScript, obj_id: int, class_name: str):
        """Bind this proxy to a different OSA object.
        
        Args:
            script: New helper script to use
            obj_id: New object ID to bind to
            class_name: New class name
        """
        if self.obj_id is not None:
            self._decrease_reference_count()
        self._helper_script = script
        self.obj_id = obj_id
        self.class_name = class_name
        # Increment reference count for new binding
        self._increase_reference_count()

    @classmethod
    def from_proxy(cls, proxy: OSAObjProxy):
        """Create a new proxy instance from an existing one.
        
        Args:
            proxy: Existing proxy object to copy from
        """
        return cls(proxy._helper_script, proxy.obj_id, proxy.class_name)

    def _set_property(self, name: str, value):
        """Set a property value on the OSA object."""
        return self._helper_script.set_properties(self, {name: value})

    def _get_property(self, name: str):
        """Get a property value from the OSA object."""
        return self._helper_script.get_property(self, name)
    
    def _call_method(self, name: str, args = None, kwargs: dict = None):
        """Call a method on the OSA object."""
        return self._helper_script.call_method(self, name, args, kwargs)

    def __del__(self):
        """Clean up by decrementing reference count when object is deleted."""
        if self.obj_id is not None:
            self._decrease_reference_count()

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """Allow the proxy object to be called like a function."""
        return self._helper_script.call_self(self, args, kwargs)


T = TypeVar('T')
class OSAObjArray(OSAObjProxy, Sequence[T]):
    """Proxy for array-like containers in JXA.
    
    Implements Python's Sequence protocol to allow iteration and indexing.
    The type parameter T represents the type of elements in the array.
    """

    def whose(self, filter) -> 'OSAObjArray[T]':
        """Apply a filter condition to the array.
        
        Args:
            filter: JXA filter condition
        Returns:
            New array containing only elements matching the filter
        """
        return self._call_method('whose', [filter])
    
    def __len__(self) -> int:
        """Get the length of the array."""
        return self._get_property('length')

    def __getitem__(self, index: int) -> T:
        """Get an item from the array by index."""
        return self._call_method('at', args=[index])

    def __iter__(self):
        """Iterate over the array elements."""
        for i in range(len(self)):
            yield self[i]

class DefaultOSAObjProxy(OSAObjProxy):
    """Default proxy implementation providing dictionary-like access.
    
    This class adds Python's mapping interface to access properties and
    methods of the OSA object using dictionary syntax.
    """
    
    def __getitem__(self, key: str):
        """Get a property value using dictionary syntax."""
        return self._get_property(key)
    
    def __setitem__(self, key: str, value):
        """Set a property value using dictionary syntax."""
        return self._set_property(key, value)
    
    def __getattr__(self, name: str):
        """Get a property value using attribute syntax."""
        return self._get_property(name)
