"""Fetch the account's own body scale history into a local CSV."""

import csv
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


FIELDS = [
    "historyId", "recordDate", "recordTimeChina", "weight", "bmi", "bodyFat",
    "bodyFatMass", "moisture", "moistureMass", "muscle", "muscleMass",
    "skeletalMuscle", "skeletalMuscleMass", "bone", "boneMass", "protein",
    "proteinMass", "leanBodyMass", "subcutaneousFat", "subcutaneousFatMass",
    "visceralFat", "bmr", "amr", "score", "bodyAge", "deviceId",
]


def md5_upper(value):
    return hashlib.md5(value.encode("utf-8")).hexdigest().upper()


def signature(values, token, timestamp):
    first = md5_upper(f"{values}{token}{timestamp}senssunhealth")
    return md5_upper("senssuntwice" + first)


def request_json(path, query, token):
    timestamp = str(int(time.time() * 1000))
    url = "https://neutral.senssun.com" + path + "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(url, headers={
        "token": token,
        "time": timestamp,
        "sign": signature("".join(str(value) for value in query.values()), token, timestamp),
        "Referer": "https://servicewechat.com/wx333b6afb50353e59/22/page-frame.html",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Scale API HTTP {exc.code}") from None
    except urllib.error.URLError:
        raise RuntimeError("Scale API network request failed") from None


def login(union_id):
    payload = request_json(
        "/base/v1/account/newThirdLogin",
        {"loginType": "neutral", "thirdId": union_id},
        "",
    )
    if payload.get("errorCode") != 0 or not isinstance(payload.get("data"), str) or not payload["data"]:
        raise RuntimeError(f"Scale login failed: {payload.get('errorCode')}")
    return payload["data"]


def fetch(quantity, user_id, token):
    payload = request_json(
        "/data/v1/four/history/findLastByQuantity",
        {"quantity": quantity, "userId": user_id},
        token,
    )
    if payload.get("errorCode") != 0 or not isinstance(payload.get("data"), list):
        raise RuntimeError(f"Scale API error {payload.get('errorCode')}: {payload.get('message')}")
    return payload["data"]


def update_csv(records, path):
    existing = {}
    if path.exists():
        with path.open("r", newline="", encoding="utf-8-sig") as file:
            for row in csv.DictReader(file):
                if row.get("historyId"):
                    existing[row["historyId"]] = row
    before = len(existing)
    for record in records:
        if not record.get("historyId"):
            continue
        row = {field: record.get(field, "") for field in FIELDS}
        if record.get("recordDate") is not None:
            row["recordTimeChina"] = datetime.fromtimestamp(
                record["recordDate"] / 1000, ZoneInfo("Asia/Shanghai")
            ).isoformat(timespec="seconds")
        existing[record["historyId"]] = row
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(sorted(existing.values(), key=lambda row: int(row["recordDate"])))
    return len(existing) - before, len(existing)


def main():
    union_id = os.environ.get("SCALE_UNION_ID", "").strip()
    user_id = os.environ.get("SCALE_USER_ID", "").strip()
    if not union_id or not user_id:
        raise RuntimeError("Set SCALE_UNION_ID and SCALE_USER_ID in repository Secrets")
    quantity = os.environ.get("SCALE_QUANTITY", "100")
    if not quantity.isdecimal() or int(quantity) < 1:
        raise RuntimeError("SCALE_QUANTITY must be a positive integer")
    output = Path(os.environ.get("SCALE_OUTPUT", "data/body_scale.csv"))
    new_count, total = update_csv(fetch(quantity, user_id, login(union_id)), output)
    print(f"Saved {new_count} new records; {total} total: {output}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Sync failed: {exc}", file=sys.stderr)
        sys.exit(1)
