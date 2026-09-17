"""解压发布包，核对内容与源码一致，并检查清单引用的资源。"""

import json
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
with tempfile.TemporaryDirectory() as temporary:
    with zipfile.ZipFile(ROOT / "dist" / f"AskAnchor-{version}-chromium.zip") as bundle:
        bundle.extractall(temporary)
    extracted = Path(temporary) / f"AskAnchor-{version}"
    files = [path for path in extracted.rglob("*") if path.is_file()]
    for path in files:
        relative = path.relative_to(extracted)
        assert path.read_bytes() == (ROOT / relative).read_bytes(), f"内容不一致：{relative}"
    manifest = json.loads((extracted / "manifest.json").read_text(encoding="utf-8"))
    resources = [manifest["background"]["service_worker"], manifest["action"]["default_popup"]]
    for entry in manifest["content_scripts"]:
        resources.extend(entry.get("js", []) + entry.get("css", []))
    for entry in manifest["web_accessible_resources"]:
        resources.extend(entry["resources"])
    for resource in resources:
        assert (extracted / resource).is_file(), f"缺少资源：{resource}"
    print(f"解压验证通过：{len(files)} 个文件与源码一致，清单引用资源齐全。")
