"use client";

import React, { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ParsedSheet = {
  productNames: string[];
  filename: string;
};

function normalizeName(name: unknown): string {
  if (name == null) return "";
  const str = String(name).trim();
  return str
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .toLowerCase();
}

function extractProductNamesFromSheet(workbook: XLSX.WorkBook): string[] {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  // 우선순위 키 후보들
  const candidateKeys = [
    "상품이름",
    "상품명",
    "제품명",
    "name",
    "product",
    "title",
  ];

  // 헤더 정규화 맵핑 생성
  const headerMap: Record<string, string> = {};
  if (json.length > 0) {
    Object.keys(json[0]).forEach((key) => {
      headerMap[normalizeName(key)] = key;
    });
  }

  let targetKey: string | undefined;
  for (const cand of candidateKeys) {
    const normalized = normalizeName(cand);
    if (headerMap[normalized]) {
      targetKey = headerMap[normalized];
      break;
    }
  }

  // 후보에서 못 찾았으면, 첫 번째 컬럼 사용 (fallback)
  if (!targetKey && json.length > 0) {
    targetKey = Object.keys(json[0])[0];
  }

  if (!targetKey) return [];

  const names = json
    .map((row) => normalizeName(row[targetKey as keyof typeof row]))
    .filter((v) => v.length > 0);

  // 중복 제거
  return Array.from(new Set(names));
}

export default function ExcelComparePage() {
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [leftData, setLeftData] = useState<ParsedSheet | null>(null);
  const [rightData, setRightData] = useState<ParsedSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File): Promise<ParsedSheet> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const productNames = extractProductNamesFromSheet(workbook);
    return { productNames, filename: file.name };
  }, []);

  const onChangeLeft = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = e.target.files?.[0] || null;
      setLeftFile(file);
      if (!file) {
        setLeftData(null);
        return;
      }
      try {
        const parsed = await handleFile(file);
        setLeftData(parsed);
      } catch (err) {
        setError("좌측 파일 파싱 중 오류가 발생했습니다.");
      }
    },
    [handleFile]
  );

  const onChangeRight = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = e.target.files?.[0] || null;
      setRightFile(file);
      if (!file) {
        setRightData(null);
        return;
      }
      try {
        const parsed = await handleFile(file);
        setRightData(parsed);
      } catch (err) {
        setError("우측 파일 파싱 중 오류가 발생했습니다.");
      }
    },
    [handleFile]
  );

  const comparison = useMemo(() => {
    const left = leftData?.productNames ?? [];
    const right = rightData?.productNames ?? [];
    const leftSet = new Set(left);
    const rightSet = new Set(right);

    const inLeftNotInRight: string[] = [];
    const inRightNotInLeft: string[] = [];
    const inBoth: string[] = [];

    left.forEach((name) => {
      if (rightSet.has(name)) inBoth.push(name);
      else inLeftNotInRight.push(name);
    });
    right.forEach((name) => {
      if (!leftSet.has(name)) inRightNotInLeft.push(name);
    });

    inLeftNotInRight.sort();
    inRightNotInLeft.sort();
    inBoth.sort();

    return { inLeftNotInRight, inRightNotInLeft, inBoth };
  }, [leftData, rightData]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">엑셀 상품명 비교</h1>
      <p className="text-sm text-gray-600 mb-6">
        두 엑셀 파일의 첫 번째 시트에서 "상품이름/상품명" 열을 추출해 존재 여부를 비교합니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="border rounded-lg p-4">
          <h2 className="font-medium mb-2">좌측 파일</h2>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onChangeLeft}
            className="block w-full text-sm"
          />
          {leftData && (
            <div className="mt-3 text-sm text-gray-700">
              <div>파일명: {leftData.filename}</div>
              <div>추출된 상품 수: {leftData.productNames.length}</div>
            </div>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="font-medium mb-2">우측 파일</h2>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onChangeRight}
            className="block w-full text-sm"
          />
          {rightData && (
            <div className="mt-3 text-sm text-gray-700">
              <div>파일명: {rightData.filename}</div>
              <div>추출된 상품 수: {rightData.productNames.length}</div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">좌측에만 있는 상품</h3>
          <div className="text-xs text-gray-500 mb-2">
            {comparison.inLeftNotInRight.length}건
          </div>
          <ul className="max-h-80 overflow-auto text-sm list-disc pl-5">
            {comparison.inLeftNotInRight.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>

        <section className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">양쪽 모두에 있는 상품</h3>
          <div className="text-xs text-gray-500 mb-2">{comparison.inBoth.length}건</div>
          <ul className="max-h-80 overflow-auto text-sm list-disc pl-5">
            {comparison.inBoth.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>

        <section className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">우측에만 있는 상품</h3>
          <div className="text-xs text-gray-500 mb-2">
            {comparison.inRightNotInLeft.length}건
          </div>
          <ul className="max-h-80 overflow-auto text-sm list-disc pl-5">
            {comparison.inRightNotInLeft.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}


