#!/usr/bin/env python3
"""Deep-merge a JSON fragment into messages/{es,en}.json.
Usage: merge-messages.py <fragment.json>   where fragment = {"es": {...}, "en": {...}}"""
import json, sys, collections

def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v
    return a

frag = json.load(open(sys.argv[1]), object_pairs_hook=collections.OrderedDict)
for loc in ("es", "en"):
    path = f"messages/{loc}.json"
    data = json.load(open(path), object_pairs_hook=collections.OrderedDict)
    merge(data, frag[loc])
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
print("merged", sys.argv[1])
