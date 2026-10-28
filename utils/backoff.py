import time
import random
import requests

MAX_RETRIES = 5
INITIAL_DELAY = 1 

def run_with_backoff(func, *args, **kwargs):
    for attempt in range(MAX_RETRIES):
        try:
            return func(*args, **kwargs)
        except requests.exceptions.RequestException as e:
            print(f"Attempt {attempt + 1}/{MAX_RETRIES} failed: {e}")
            if attempt < MAX_RETRIES - 1:
                delay = INITIAL_DELAY * (2 ** attempt) + random.uniform(0, 1)
                time.sleep(delay)
            else:
                raise Exception(f"AI analysis failed after {MAX_RETRIES} attempts.") from e
        except Exception as e:
            raise e