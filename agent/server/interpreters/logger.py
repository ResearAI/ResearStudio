import logging

def get_logger(name: str = __name__, level=logging.INFO):
    logger = logging.getLogger(name)
    if not logger.handlers:  
        logger.setLevel(level)
        ch = logging.StreamHandler()
        ch.setLevel(level)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        ch.setFormatter(formatter)
        logger.addHandler(ch)
    return logger