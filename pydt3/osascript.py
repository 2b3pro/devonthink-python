from __future__ import annotations

import json
import os
from logging import getLogger
from Foundation import NSAppleScript, NSURL, NSAppleEventDescriptor


logger = getLogger(__name__)


class OSAScript:
    """Base class for executing AppleScript/JXA scripts via macOS's Open Scripting Architecture.
    
    This class provides low-level functionality to load and execute AppleScript/JXA scripts
    using macOS's native scripting infrastructure through PyObjC bindings.
    """

    def __init__(self, script: NSAppleScript):
        """Initialize with a compiled AppleScript.
        
        Args:
            script: Compiled NSAppleScript instance
        """
        self.script = script

    @classmethod
    def from_path(cls, path):
        """Create an OSAScript instance from a script file.
        
        Args:
            path: Path to the .scpt script file
            
        Returns:
            OSAScript: New instance initialized with the compiled script
            
        Raises:
            RuntimeError: If script compilation fails
        """
        url = NSURL.fileURLWithPath_(path)
        script, error = NSAppleScript.alloc().initWithContentsOfURL_error_(url, None)
        if error:
            raise RuntimeError(error)
        return cls(script)

    def _call_str(self, func_name: str, arg: str):
        """Call a function in the script with a string argument.
        
        This method handles the low-level details of creating and executing
        an Apple Event to invoke a function in the script.
        
        Args:
            func_name: Name of the function to call
            arg: String argument to pass to the function
            
        Returns:
            str: Result of the function call as a string
            
        Raises:
            RuntimeError: If the script execution fails
        """
        script = self.script
        # Create the Apple Event for script execution
        event = NSAppleEventDescriptor.appleEventWithEventClass_eventID_targetDescriptor_returnID_transactionID_(
            self.fourcharcode(b'ascr'), self.fourcharcode(b'psbr'), 
            NSAppleEventDescriptor.nullDescriptor(), 0, 0)
        
        # Set up the function arguments
        descriptor_list = NSAppleEventDescriptor.listDescriptor()
        descriptor_list.insertDescriptor_atIndex_(NSAppleEventDescriptor.descriptorWithString_(arg), 0)
        event.setDescriptor_forKeyword_(descriptor_list, self.fourcharcode(b'----'))

        # Set the function name
        event.setDescriptor_forKeyword_(
            NSAppleEventDescriptor.descriptorWithString_(func_name), 
            self.fourcharcode(b'snam'))

        # Execute the event and handle any errors
        result, error = script.executeAppleEvent_error_(event, None)
        if error:
            raise RuntimeError(error)
        else:
            return result.stringValue()

    def fourcharcode(self, chars: bytes):
        """Convert a 4-character code to its integer representation.
        
        Apple Events use 4-character codes as identifiers. This method converts
        a 4-byte string to its corresponding integer value.
        
        Args:
            chars: 4-byte string to convert
            
        Returns:
            int: Integer representation of the 4-character code
        """
        return int.from_bytes(chars, 'big')
    
    def __eq__(self, o: object) -> bool:
        """Compare two OSAScript instances.
        
        Scripts are considered equal if they reference the same NSAppleScript.
        """
        return self.script == o.script


if __name__ == '__main__':
    # Example usage
    script = OSAScript.from_path('/Users/koc/Developer/devonthink/python-api/pydt3/test.scpt')
    print(script._call('echo', 'hello world'))
