# MODEL & API (See https://github.com/camel-ai/camel/blob/master/camel/types/enums.py)

# OPENAI API
OPENAI_API_KEY=""
OPENAI_BASE_URL=""
# Qwen API (https://help.aliyun.com/zh/model-studio/developer-reference/get-api-key)
QWEN_API_KEY=""

# DeepSeek API (https://platform.deepseek.com/api_keys)
DEEPSEEK_API_KEY=""  # English: 定义variable以避免NameError
#GEMINI
GEMINI_API_KEY=""
#===========================================
# Tools & Services API
#===========================================

# Google Search API (https://developers.google.com/custom-search/v1/overview)
GOOGLE_API_KEY=""
SEARCH_ENGINE_ID=""

# Hugging Face API (https://huggingface.co/join)
HF_TOKEN=""

# Chunkr API (https://chunkr.ai/)
CHUNKR_API_KEY=""

# Firecrawl API (https://www.firecrawl.dev/)
FIRECRAWL_API_KEY=""

# Jina API
JINA_API_KEY=""

# ASSEMBLYAI API 
ASSEMBLYAI_API_KEY=""

BROWSERBASE_API_KEY=""
BROWSERBASE_PROJECT_ID=""




import os
os.environ["OPENAI_API_KEY"] = OPENAI_API_KEY
os.environ["OPENAI_BASE_URL"] = OPENAI_BASE_URL
os.environ["QWEN_API_KEY"] = QWEN_API_KEY
os.environ["DEEPSEEK_API_KEY"] = DEEPSEEK_API_KEY
os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY
os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY
os.environ["SEARCH_ENGINE_ID"] = SEARCH_ENGINE_ID
os.environ["HF_TOKEN"] = HF_TOKEN
os.environ["CHUNKR_API_KEY"] = CHUNKR_API_KEY
os.environ["FIRECRAWL_API_KEY"] = FIRECRAWL_API_KEY
os.environ["JINA_API_KEY"] = JINA_API_KEY
os.environ["ASSEMBLYAI_API_KEY"] = ASSEMBLYAI_API_KEY
os.environ["BROWSERBASE_API_KEY"] = BROWSERBASE_API_KEY
os.environ["BROWSERBASE_PROJECT_ID"] = BROWSERBASE_PROJECT_ID
