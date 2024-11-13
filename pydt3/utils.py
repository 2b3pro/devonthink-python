import weakref
import functools

def weak_lru(maxsize=128, typed=False):
    """LRU Cache decorator that keeps a weak reference to "self".
    
    This is a specialized version of functools.lru_cache that prevents memory leaks
    when caching method calls on objects by storing only weak references to the objects.
    
    Args:
        maxsize: Maximum size of the cache (default: 128)
        typed: Whether different types of arguments should be cached separately (default: False)
        
    Returns:
        Decorator function that can be applied to methods
        
    Example:
        class MyClass:
            @weak_lru(maxsize=100)
            def my_method(self, arg):
                # Method implementation
                pass
    """
    def wrapper(func):
        # Create an LRU cache for the inner function
        @functools.lru_cache(maxsize, typed)
        def _func(_self, *args, **kwargs):
            # The actual function call using the weak reference
            return func(_self(), *args, **kwargs)

        @functools.wraps(func)
        def inner(self, *args, **kwargs):
            # Create a weak reference to self and pass it to the cached function
            return _func(weakref.ref(self), *args, **kwargs)

        return inner

    return wrapper
