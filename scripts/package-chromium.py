"""生成可直接解压加载的 Chrome / Edge 包，只收录运行文件和用户说明。"""

import hashlib
import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
assert json.loads((ROOT / "package.json").read_text())["version"] == version
files = {
    "manifest.json", "background.js", "contentScript.js", "popup.html",
    "options.html", "settings.js", "settings.css", "styles.css", "LICENSE",
    "README.md", "BROWSER_SUPPORT.md",
}
files.update(path.relative_to(ROOT).as_posix() for path in (ROOT / "src").rglob("*.js"))
for content in manifest["content_scripts"]:
    files.update(content.get("js", []))
    files.update(content.get("css", []))
for entry in manifest["web_accessible_resources"]:
    files.update(entry["resources"])
for name in files:
    assert (ROOT / name).is_file(), f"打包缺少文件：{name}"

output = ROOT / "dist"
output.mkdir(exist_ok=True)
archive = output / f"AskAnchor-{version}-chromium.zip"
prefix = f"AskAnchor-{version}"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(files):
        # 固定时间戳，确保相同内容重复打包得到相同校验值。
        info = zipfile.ZipInfo(f"{prefix}/{name}", date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        bundle.writestr(info, (ROOT / name).read_bytes())
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None, "ZIP 完整性验证失败"
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
print(f"已打包 {len(files)} 个文件：{archive}")
print(f"SHA256：{digest}")
