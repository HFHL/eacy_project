from __future__ import annotations

import html
import re
import zipfile
from datetime import date, datetime
from io import BytesIO
from typing import Any


class SimpleXlsxWriter:
    def __init__(self) -> None:
        self.sheets: list[tuple[str, list[list[Any]]]] = []

    def add_sheet(self, name: str, rows: list[list[Any]]) -> None:
        safe_name = self._safe_sheet_name(name)
        used = {item[0] for item in self.sheets}
        if safe_name in used:
            base = safe_name[:28]
            index = 2
            while f"{base}_{index}" in used:
                index += 1
            safe_name = f"{base}_{index}"
        self.sheets.append((safe_name, rows or [[]]))

    def to_bytes(self) -> bytes:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", self._content_types())
            archive.writestr("_rels/.rels", self._root_rels())
            archive.writestr("xl/workbook.xml", self._workbook())
            archive.writestr("xl/_rels/workbook.xml.rels", self._workbook_rels())
            archive.writestr("xl/styles.xml", self._styles())
            for index, (_, rows) in enumerate(self.sheets, start=1):
                archive.writestr(f"xl/worksheets/sheet{index}.xml", self._worksheet(rows))
        return buffer.getvalue()

    def _safe_sheet_name(self, name: str) -> str:
        safe = re.sub(r"[\\/*?:\[\]]+", "_", str(name or "Sheet")).strip() or "Sheet"
        return safe[:31]

    def _content_types(self) -> str:
        sheet_overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for idx in range(1, len(self.sheets) + 1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            f"{sheet_overrides}"
            "</Types>"
        )

    def _root_rels(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        )

    def _workbook(self) -> str:
        sheets = "".join(
            f'<sheet name="{html.escape(name)}" sheetId="{idx}" r:id="rId{idx}"/>'
            for idx, (name, _) in enumerate(self.sheets, start=1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<sheets>{sheets}</sheets>"
            "</workbook>"
        )

    def _workbook_rels(self) -> str:
        rels = "".join(
            f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>'
            for idx in range(1, len(self.sheets) + 1)
        )
        rels += f'<Relationship Id="rId{len(self.sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{rels}"
            "</Relationships>"
        )

    def _styles(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            "</styleSheet>"
        )

    def _worksheet(self, rows: list[list[Any]]) -> str:
        sheet_data = []
        for row_index, row in enumerate(rows, start=1):
            cells = []
            for column_index, value in enumerate(row, start=1):
                cells.append(self._cell(row_index, column_index, value, header=row_index == 1))
            sheet_data.append(f'<row r="{row_index}">{"".join(cells)}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<sheetData>{"".join(sheet_data)}</sheetData>'
            "</worksheet>"
        )

    def _cell(self, row_index: int, column_index: int, value: Any, *, header: bool = False) -> str:
        ref = f"{self._column_name(column_index)}{row_index}"
        style = ' s="1"' if header else ""
        if value is None:
            return f'<c r="{ref}"{style}/>'
        if isinstance(value, bool):
            return f'<c r="{ref}" t="b"{style}><v>{1 if value else 0}</v></c>'
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return f'<c r="{ref}"{style}><v>{value}</v></c>'
        text = html.escape(self._stringify(value), quote=False)
        return f'<c r="{ref}" t="inlineStr"{style}><is><t>{text}</t></is></c>'

    def _column_name(self, index: int) -> str:
        name = ""
        while index:
            index, remainder = divmod(index - 1, 26)
            name = chr(65 + remainder) + name
        return name

    def _stringify(self, value: Any) -> str:
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value)
