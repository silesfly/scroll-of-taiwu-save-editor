#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate src/catalog-data.js from Taiwu gamedata_dump.json and Language_KO/*.txt.
Strictly 100% pure-Korean (no Hanzi, no rich text tags), Python 3.12 stdlib.
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path

DEFAULT_SOURCE_DIR = Path("/home/jiyoung/workspace/무협위키/.local/graph/scroll-of-taiwu-data")
OUTPUT_JS_PATH = Path("/home/jiyoung/workspace/editors/태오회권_에디터/src/catalog-data.js")

HANZI_REGEX = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')
TAG_REGEX = re.compile(r'<[^>]+>')

def clean_text(text: str) -> str:
    if not text:
        return ""
    text = TAG_REGEX.sub('', text)
    text = HANZI_REGEX.sub('', text)
    return text.strip()

def parse_language_file(file_path: Path) -> dict:
    result = {}
    if not file_path.exists():
        return result
    content = file_path.read_text(encoding='utf-8', errors='ignore')
    lines = content.splitlines()
    i = 0
    while i < len(lines) - 1:
        key_line = lines[i].strip()
        val_line = lines[i+1].strip()
        m = re.match(r'^(Name|Surname|Desc|TypeName|Options_\d+_\d+)_(\d+)$', key_line)
        if m:
            prefix, idx_str = m.groups()
            if prefix == 'Name':
                cleaned = clean_text(val_line)
                if cleaned:
                    result[int(idx_str)] = cleaned
            i += 2
        else:
            i += 1
    return result

def verify_no_forbidden(obj) -> int:
    violations = 0
    if isinstance(obj, str):
        if HANZI_REGEX.search(obj) or TAG_REGEX.search(obj):
            violations += 1
    elif isinstance(obj, dict):
        for k, v in obj.items():
            violations += verify_no_forbidden(k)
            violations += verify_no_forbidden(v)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            violations += verify_no_forbidden(item)
    return violations

def main():
    parser = argparse.ArgumentParser(description="Extract Taiwu catalog data into src/catalog-data.js")
    parser.add_argument("--source-dir", type=str, default=str(DEFAULT_SOURCE_DIR), help="Path to scroll-of-taiwu-data")
    parser.add_argument("--check-only", action="store_true", help="Validate existing src/catalog-data.js without rewriting")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)

    if args.check_only:
        if not OUTPUT_JS_PATH.exists():
            print(f"Error: {OUTPUT_JS_PATH} does not exist for check-only.", file=sys.stderr)
            sys.exit(1)
        content = OUTPUT_JS_PATH.read_text(encoding='utf-8')
        try:
            idx1 = content.find('return ')
            idx2 = content.rfind('}));')
            if idx1 != -1 and idx2 != -1:
                json_str = content[idx1 + len('return '):idx2].strip()
                if json_str.endswith(';'):
                    json_str = json_str[:-1].strip()
                data = json.loads(json_str)
                violations = verify_no_forbidden(data)
                if violations > 0:
                    print(f"Check failed: found {violations} forbidden strings (Hanzi or tags).", file=sys.stderr)
                    sys.exit(1)
                print(f"Check passed successfully. Verified {len(data)} categories.")
                sys.exit(0)
            print("Error: Could not parse TAIWU_CATALOG structure from JS file.", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Check failed with exception: {e}", file=sys.stderr)
            sys.exit(1)

    if not source_dir.exists():
        print(f"Error: Source directory {source_dir} does not exist.", file=sys.stderr)
        sys.exit(1)

    lang_ko_dir = source_dir / "Language_KO"
    gamedata_json_path = source_dir / "gamedata_dump.json"

    if not gamedata_json_path.exists():
        print(f"Error: {gamedata_json_path} missing.", file=sys.stderr)
        sys.exit(1)

    gamedata = json.loads(gamedata_json_path.read_text(encoding='utf-8'))

    # 1. Organizations
    org_lang = parse_language_file(lang_ko_dir / "Organization_language.txt")
    orgs_raw = gamedata.get("Organizations", [])
    organizations = {}
    for org in orgs_raw:
        if not isinstance(org, dict):
            continue
        tid = org.get("TemplateId")
        if tid is not None and tid in org_lang:
            organizations[str(tid)] = {
                "name": org_lang[tid],
                "isSect": bool(org.get("IsSect", False)),
                "isCivilian": bool(org.get("IsCivilian", False))
            }

    # 2. Professions
    prof_lang = parse_language_file(lang_ko_dir / "Profession_language.txt")
    profs_raw = gamedata.get("Professions", [])
    professions = []
    for prof in profs_raw:
        if not isinstance(prof, dict):
            continue
        tid = prof.get("TemplateId")
        if tid is not None and tid in prof_lang:
            professions.append({
                "id": tid,
                "name": prof_lang[tid]
            })

    # 3. Features
    feat_lang = parse_language_file(lang_ko_dir / "CharacterFeature_language.txt")
    features = {str(k): v for k, v in feat_lang.items()}

    # 4. CombatSkillTypes
    cst_lang = parse_language_file(lang_ko_dir / "CombatSkillType_language.txt")
    combat_skill_types = {str(k): v for k, v in cst_lang.items()}

    # 5. LifeSkillTypes
    lst_lang = parse_language_file(lang_ko_dir / "LifeSkillType_language.txt")
    life_skill_types = {str(k): v for k, v in lst_lang.items()}

    # 6. CombatSkills
    cs_lang = parse_language_file(lang_ko_dir / "CombatSkill_language.txt")
    cs_raw = gamedata.get("CombatSkills", [])
    combat_skills = {}
    for cs in cs_raw:
        if not isinstance(cs, dict):
            continue
        tid = cs.get("TemplateId")
        if tid is not None and tid in cs_lang:
            combat_skills[str(tid)] = {
                "name": cs_lang[tid],
                "grade": cs.get("Grade", 0),
                "sectId": cs.get("SectId", 0),
                "equipType": cs.get("EquipType", 0),
                "type": cs.get("Type", 0)
            }

    # 7. LifeSkills
    ls_lang = parse_language_file(lang_ko_dir / "LifeSkill_language.txt")
    ls_raw = gamedata.get("LifeSkills", [])
    life_skills = {}
    for ls in ls_raw:
        if not isinstance(ls, dict):
            continue
        tid = ls.get("TemplateId")
        if tid is not None and tid in ls_lang:
            life_skills[str(tid)] = [
                ls_lang[tid],
                ls.get("Grade", 0),
                ls.get("Type", 0)
            ]

    # 8. BuildingBlocks
    bb_lang = parse_language_file(lang_ko_dir / "BuildingBlock_language.txt")
    building_blocks = {str(k): v for k, v in bb_lang.items()}

    # 9. Items categorized by ItemType (0..12)
    item_file_map = {
        0: "Weapon_language.txt",
        1: "Armor_language.txt",
        2: "Accessory_language.txt",
        3: "Clothing_language.txt",
        4: "Carrier_language.txt",
        5: "Material_language.txt",
        6: "CraftTool_language.txt",
        7: "Food_language.txt",
        8: "Medicine_language.txt",
        9: "TeaWine_language.txt",
        10: "SkillBook_language.txt",
        11: "Cricket_language.txt",
        12: "Misc_language.txt"
    }
    items = {}
    for item_type_id, fname in item_file_map.items():
        fpath = lang_ko_dir / fname
        parsed_items = parse_language_file(fpath)
        items[str(item_type_id)] = {str(k): v for k, v in parsed_items.items()}

    item_type_names = [
        "무기", "방어구", "장신구", "의상", "탈것", "소재", "도구", "음식", "약품", "차와 술", "서적", "촉직", "잡다"
    ]
    main_attribute_names = ["완력", "민첩", "정신력", "체질", "근골", "지력"]
    resource_names = ["식재", "목재", "금철", "옥석", "직물", "약재", "은전", "명성"]
    consummate_level_names = ["신공", "정화", "조기", "기완", "신족", "납원", "출신", "입화", "귀허"]
    world_difficulty_labels = ["보통", "곤난", "극난", "필사"]

    catalog_data = {
        "organizations": organizations,
        "professions": professions,
        "features": features,
        "combatSkillTypes": combat_skill_types,
        "lifeSkillTypes": life_skill_types,
        "combatSkills": combat_skills,
        "lifeSkills": life_skills,
        "buildingBlocks": building_blocks,
        "items": items,
        "itemTypeNames": item_type_names,
        "mainAttributeNames": main_attribute_names,
        "resourceNames": resource_names,
        "consummateLevelNames": consummate_level_names,
        "worldDifficultyLabels": world_difficulty_labels
    }

    violations = verify_no_forbidden(catalog_data)
    if violations > 0:
        print(f"Error: Generated catalog contains {violations} forbidden strings (Hanzi or tags).", file=sys.stderr)
        sys.exit(1)

    json_payload = json.dumps(catalog_data, ensure_ascii=False, separators=(',', ':'))

    js_content = "// Generated by tools/extract_catalog.py — DO NOT EDIT MANUALLY\n" + \
                 "(function(root, factory) {\n" + \
                 "    if (typeof define === 'function' && define.amd) {\n" + \
                 "        define([], factory);\n" + \
                 "    } else if (typeof module === 'object' && module.exports) {\n" + \
                 "        module.exports = factory();\n" + \
                 "    } else {\n" + \
                 "        root.TAIWU_CATALOG = factory();\n" + \
                 "    }\n" + \
                 "}(typeof self !== 'undefined' ? self : this, function() {\n" + \
                 "    return " + json_payload + ";\n" + \
                 "}));\n"

    OUTPUT_JS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = OUTPUT_JS_PATH.with_suffix('.tmp')
    tmp_path.write_text(js_content, encoding='utf-8')
    tmp_path.replace(OUTPUT_JS_PATH)

    file_size_mib = OUTPUT_JS_PATH.stat().st_size / (1024 * 1024)
    print(f"Successfully generated {OUTPUT_JS_PATH} ({file_size_mib:.2f} MiB).")

if __name__ == '__main__':
    main()
