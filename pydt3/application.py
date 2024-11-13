from __future__ import annotations

from typing import TYPE_CHECKING
from functools import lru_cache
from typing import Optional

from .objproxy import DefaultOSAObjProxy
from .helper_bridging import HelperScript


class Application(DefaultOSAObjProxy):
    """Base class for interacting with macOS applications via Apple Script/JXA.
    
    This class provides core functionality to communicate with macOS applications
    through Apple's scripting architecture. It handles the low-level details of
    object proxying and method calls.
    """
    
    def __init__(self, name: Optional[str] = None, helper_script: Optional[HelperScript] = None, 
                 obj_id: Optional[int] = None, class_name: Optional[str] = None):
        """Initialize an Application instance.
        
        Args:
            name: Name of the application to control
            helper_script: Helper script instance for JXA communication
            obj_id: Object ID for referencing in the helper script
            class_name: Class name of the application object
        """
        if all([helper_script, obj_id, class_name]):
            super().__init__(helper_script, obj_id, class_name)
        elif name is not None:
            helper_script = HelperScript.default
            app = helper_script.get_application(name)
            super().__init__(helper_script, app.obj_id, app.class_name)
        else:
            raise ValueError('`name` or `helper_script`, `obj_id`, `class_name` must be provided')
    
    @property
    def id(self) -> str:
        """The unique identifier of the application.
        
        Returns:
            str: Application's unique identifier
        """
        return self._call_method('id')

    @property
    def name(self) -> str:
        """The name of the application.
        
        Returns:
            str: Application's name
        """
        return self._call_method('name') # The name is a function so it needs special handling

    @property
    def frontmost(self) -> bool:
        """Whether the application is currently frontmost.
        
        Returns:
            bool: True if application is frontmost, False otherwise
        """
        return self._call_method('frontmost')

    def activate(self):
        """Activate the application (bring it to front)."""
        return self._call_method('activate')

# Register Application class as the default handler for application objects
HelperScript.set_default_class_map({
    'application': Application
})
