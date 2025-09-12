from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseInterpreter(ABC):
    r"""An abstract base class for code interpreters."""

    @abstractmethod
    def run(self, code: str, code_type: str) -> str:
        r"""Executes the given code based on its type.

        Args:
            code (str): The code to be executed.
            code_type (str): The type of the code, which must be one of the
                types returned by `supported_code_types()`.

        Returns:
            str: The result of the code execution. If the execution fails, this
                should include sufficient information to diagnose and correct
                the issue.

        Raises:
            InterpreterError: If the code execution encounters errors that
                could be resolved by modifying or regenerating the code.
        """
        pass

    @abstractmethod
    def supported_code_types(self) -> List[str]:
        r"""Provides supported code types by the interpreter."""
        pass

    @abstractmethod
    def update_action_space(self, action_space: Dict[str, Any]) -> None:
        r"""Updates action space for *python* interpreter"""
        pass
