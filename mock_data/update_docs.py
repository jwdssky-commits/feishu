import json
import sys
import os

filepath = os.path.join(os.path.dirname(__file__), "documents.json")

with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

# This script has already been run. Keeping for reference only.
# DOC-13 through DOC-16 raw_text fields have been expanded.

for doc in data:
    if doc['id'] in ('DOC-13', 'DOC-14', 'DOC-15', 'DOC-16'):
        cn = sum(1 for c in doc['raw_text'] if '一' <= c <= '鿿')
        print(f"{doc['id']}: total_len={len(doc['raw_text'])}, cn_chars={cn}")
