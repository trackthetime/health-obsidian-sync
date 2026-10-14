import json
import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path

import openpyxl

import refresh


class RefreshTest(unittest.TestCase):
    def test_end_to_end_with_archive_and_preserved_notes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            health = root / "health"
            daily = root / "scriptable" / "DailyBlocks"
            training = root / "scriptable" / "TrainingLogs"
            for directory in (health, daily, training):
                directory.mkdir(parents=True)

            export = {
                "metrics": [
                    {"id": "Steps", "display_name": "Steps", "unit": "count", "data_points": [
                        {"start_date": "2026-10-14T08:00:00+08:00", "value": 6500}]},
                    {"id": "Resting Heart Rate", "display_name": "Resting Heart Rate", "unit": "count/min", "data_points": [
                        {"start_date": "2026-10-14T08:00:00+08:00", "value": 61}]},
                ],
                "category_metrics": [{"id": "Sleep Analysis", "data_points": [
                    {"start_date": "2026-10-13T23:00:00+08:00", "end_date": "2026-10-14T06:00:00+08:00", "label": "asleep"}]}],
                "workouts": [],
            }
            (health / "sample.json").write_text(json.dumps(export), encoding="utf-8")
            (daily / "2026-10-14.json").write_text(json.dumps({"date": "2026-10-14", "tasks": [
                {"start": 480, "end": 540, "goal": "阅读", "status": 1, "actual": "完成"}]}), encoding="utf-8")
            (training / "training-records.json").write_text(json.dumps({"version": 1, "records": {
                "2026-10-14": ["有氧"]}}), encoding="utf-8")

            book = root / "diet.xlsx"
            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.title = "饮食与运动记录"
            sheet["A9"] = date(2026, 10, 14)
            sheet["B9"] = "午餐"
            sheet["C9"] = "米饭"
            sheet["D9"] = "1 碗"
            sheet["G9"] = "步行"
            sheet["H9"] = "30 分钟"
            workbook.save(book)
            workbook.close()

            scale = root / "scale.csv"
            with scale.open("w", newline="", encoding="utf-8") as file:
                writer = csv.DictWriter(file, fieldnames=["historyId", "recordDate", "weight", "bodyFat"])
                writer.writeheader()
                writer.writerow({"historyId": "sample", "recordDate": "1791936000000", "weight": "68.2", "bodyFat": "18.5"})

            config = root / "config.json"
            config.write_text(json.dumps({
                "vault_path": str(root / "vault"),
                "health_export_dir": str(health),
                "scriptable_dir": str(root / "scriptable"),
                "diet_workbook": str(book),
                "archive_dir": str(root / "archive"),
                "schedule_time": "09:30",
                "scale_csv": str(scale),
                "scale_source_label": "示例体脂秤",
            }), encoding="utf-8")
            refresh.configure(config)
            self.assertIsNone(refresh.main())

            vault = root / "vault"
            self.assertEqual(8, len(list(vault.glob("*.md"))))
            overview = (vault / "生活与健康总览.md").read_text(encoding="utf-8")
            self.assertIn("6,500", overview)
            self.assertIn("饮食训练日历", overview)
            self.assertIn("未启用云端采集", overview)
            self.assertIn("示例体脂秤", overview)
            self.assertIn("68.2 kg", overview)
            self.assertIn("米饭", (vault / "饮食记录.md").read_text(encoding="utf-8"))
            self.assertIn("阅读", (vault / "每日事项.md").read_text(encoding="utf-8"))
            self.assertTrue((vault / "_assets" / "sleep-timeline.svg").exists())

            page = vault / "饮食记录.md"
            page.write_text(page.read_text(encoding="utf-8") + "\n保留这段个人笔记。\n", encoding="utf-8")
            (health / "sample.json").unlink()
            refresh.main()
            self.assertIn("保留这段个人笔记。", page.read_text(encoding="utf-8"))
            self.assertIn("6,500", (vault / "生活与健康总览.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
