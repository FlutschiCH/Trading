import inspect
import pandas as pd
from indicator_handler import IndicatorHandler

class IndicatorHelper:
    """
    Helper to dynamically discover, inspect, and list indicator functions
    defined in IndicatorHandler at startup.
    """
    _indicators_cache = None

    @classmethod
    def get_all_indicators(cls) -> list:
        if cls._indicators_cache is not None:
            return cls._indicators_cache

        indicators = []
        # Methods or utility helpers to ignore when generating the indicator list
        ignore_methods = {
            'compute', 'get_catalog', 'evaluate_indicator_rules', 
            '_apply_smoothing', 'compute_fvgs'
        }

        for name, method in inspect.getmembers(IndicatorHandler, predicate=inspect.isroutine):
            if name.startswith('_') or name in ignore_methods:
                continue

            sig = inspect.signature(method)
            params = []
            for p_name, param in sig.parameters.items():
                if p_name in ('df', 'self', 'cls'):
                    continue
                
                param_info = {
                    "name": p_name,
                    "default": None if param.default is inspect.Parameter.empty else param.default,
                    "has_default": param.default is not inspect.Parameter.empty
                }
                params.append(param_info)

            doc = inspect.getdoc(method) or ""

            indicators.append({
                "name": name,
                "description": doc.strip().split("\n")[0] if doc else "",
                "full_doc": doc,
                "parameters": params
            })

        cls._indicators_cache = indicators
        return cls._indicators_cache

# Initialize cache on module import / startup
IndicatorHelper.get_all_indicators()
