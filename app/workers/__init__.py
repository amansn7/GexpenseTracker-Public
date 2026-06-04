from .queue import RedisTaskQueue, Task, TaskQueue, TaskStatus, _get_task_queue


def __getattr__(name):
    if name == "task_queue":
        return _get_task_queue()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
