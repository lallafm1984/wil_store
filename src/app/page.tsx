"use client";

import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";

interface ProductData {
  상품명: string;
  수량: number;
  매출금액: number;
  개별금액?: number;
}

interface GroupedProductData {
  mainProduct: ProductData;
  sizeProducts: ProductData[];
}

interface ExcelRow {
  [key: string]: string | number;
}

export default function Home() {
  const [groupedData, setGroupedData] = useState<GroupedProductData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [productRefsByName, setProductRefsByName] = useState<Record<string, { 품번?: string; 품목코드?: string }>>({});
  const [totalPaidAmount, setTotalPaidAmount] = useState(0);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const data = await readExcelFile(file);
      const totalPaid = data.reduce((sum, item) => sum + (item.매출금액 || 0), 0);
      setTotalPaidAmount(totalPaid);
      const aggregatedData = aggregateDataByProduct(data);
      const grouped = groupProductsBySize(aggregatedData);
      setGroupedData(grouped);
    } catch (error) {
      console.error("파일 처리 중 오류가 발생했습니다:", error);
      alert("파일 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadProductRefs = async () => {
      try {
        const res = await fetch('/참조상품.csv');
        if (!res.ok) return;
        const text = await res.text();
        const map = parseProductCsv(text);
        setProductRefsByName(map);
      } catch (e) {
        console.error('참조상품 CSV 로드 실패', e);
      }
    };
    loadProductRefs();
  }, []);

  const parseProductCsv = (text: string): Record<string, { 품번?: string; 품목코드?: string }> => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const map: Record<string, { 품번?: string; 품목코드?: string }> = {};
    // Expect header: 상품명,품번,품목코드
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const name = (parts[0] ?? '').trim();
      const code = (parts[1] ?? '').trim();
      const itemCode = (parts[2] ?? '').trim();
      if (!name) continue;
      map[name] = { 품번: code || undefined, 품목코드: itemCode || undefined };
    }
    return map;
  };

  const readExcelFile = (file: File): Promise<ProductData[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[];
          
          const processedData = jsonData.map((row: ExcelRow) => ({
            상품명: String(row["개별상품 명"] || row["상품명"] || "").trim(),
            수량: Number(row["개별상품 개수"] || row["수량"] || 0),
            매출금액: Number(row["결제금액"] || row["매출금액(배송비포함)"] || 0),
            개별금액: Number(row["개별상품 금액"] || row["상품 개별 금액"] || 0)
          })).filter(item => item.상품명 && item.상품명.trim() !== "");
          
          resolve(processedData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const aggregateDataByProduct = (data: ProductData[]): ProductData[] => {
    const aggregated: { [key: string]: ProductData } = {};
    
    data.forEach(item => {
      if (aggregated[item.상품명]) {
        aggregated[item.상품명].수량 += item.수량;
        aggregated[item.상품명].매출금액 += item.매출금액;
      } else {
        aggregated[item.상품명] = { ...item };
      }
    });
    
    return Object.values(aggregated).sort((a, b) => b.매출금액 - a.매출금액);
  };

  const groupProductsBySize = (data: ProductData[]): GroupedProductData[] => {
    const mainProducts: { [key: string]: ProductData } = {};
    const sizeProducts: { [key: string]: ProductData[] } = {};
    
    data.forEach(item => {
      if (item.상품명.includes('_')) {
        // 사이즈 상품인 경우
        // 메인 상품을 찾기 위해 모든 메인 상품과 비교
        let matchedMainProduct = null;
        for (const mainProductName in mainProducts) {
          if (item.상품명.includes(mainProductName)) {
            matchedMainProduct = mainProductName;
            break;
          }
        }
        
        if (matchedMainProduct) {
          if (!sizeProducts[matchedMainProduct]) {
            sizeProducts[matchedMainProduct] = [];
          }
          // 사이즈 상품의 매출금액을 메인 상품의 개별 금액 * 수량으로 계산
          const mainProduct = mainProducts[matchedMainProduct];
          const calculatedItem = {
            ...item,
            매출금액: (mainProduct.개별금액 || 0) * item.수량
          };
          sizeProducts[matchedMainProduct].push(calculatedItem);
        }
      } else {
        // 메인 상품인 경우
        mainProducts[item.상품명] = item;
      }
    });
    
    const result: GroupedProductData[] = [];
    
    // 메인 상품들을 매출금액 순으로 정렬
    const sortedMainProducts = Object.values(mainProducts).sort((a, b) => b.매출금액 - a.매출금액);
    
    sortedMainProducts.forEach(mainProduct => {
      const sizeList = sizeProducts[mainProduct.상품명] || [];
      // 사이즈 상품들을 수량 순으로 정렬
      const sortedSizeProducts = sizeList.sort((a, b) => b.수량 - a.수량);
      
      // 쇼핑백 상품들의 개별 금액 설정
      let individualPrice = mainProduct.개별금액 || 0;
      if (mainProduct.상품명 === "쇼핑백 중") {
        individualPrice = 100;
      } else if (mainProduct.상품명 === "쇼핑백 대") {
        individualPrice = 200;
      }
      
      // 메인 상품의 총 매출을 다시 계산
      let recalculatedMainProduct;
      if (mainProduct.상품명 === "쇼핑백 중" || mainProduct.상품명 === "쇼핑백 대") {
        // 쇼핑백 상품은 개별 금액 * 수량으로 계산
        recalculatedMainProduct = {
          ...mainProduct,
          매출금액: individualPrice * mainProduct.수량
        };
      } else {
        // 다른 메인 상품은 사이즈 상품들의 매출 합계
        const totalSizeRevenue = sortedSizeProducts.reduce((sum, sizeProduct) => sum + sizeProduct.매출금액, 0);
        recalculatedMainProduct = {
          ...mainProduct,
          매출금액: totalSizeRevenue
        };
      }
      
      result.push({
        mainProduct: recalculatedMainProduct,
        sizeProducts: sortedSizeProducts
      });
    });
    
    return result;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  const totalSaleAmount = groupedData.reduce((sum, group) => sum + group.mainProduct.매출금액, 0);
  const pointUsageAmount = totalSaleAmount - totalPaidAmount;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            📊 무인매장 매출 엑셀 변환
          </h1>
          <p className="text-lg text-gray-600">
            일일 매출 엑셀 파일을 업로드 하세요.
          </p>
        </div>

        {/* 파일 업로드 섹션 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mt-4">
                <label htmlFor="file-upload" className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors">
                  엑셀 파일 선택
                </label>
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="sr-only"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                .xlsx 또는 .xls 파일만 지원됩니다
              </p>
              <p className="text-xs text-gray-400 mt-1">
                매출현황 -{'>'}  매출내역 -{'>'} 엑셀다운로드(정산자료)의 파일을 업로드 해주세요.
              </p>
            </div>
          </div>
        </div>

        {/* 로딩 상태 */}
        {isLoading && (
          <div className="text-center py-8">
            <div className="inline-flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              파일을 처리하고 있습니다...
            </div>
          </div>
        )}

        {/* 결과 표시 */}
        {groupedData.length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                상품별 매출 ({groupedData.length}개 상품)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      순위
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상품명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     품목코드
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     품번
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      총 수량
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      판매 금액
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedData.map((group, index) => (
                    <React.Fragment key={group.mainProduct.상품명}>
                      {/* 메인 상품 행 */}
                      <tr className="hover:bg-gray-50 bg-blue-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {group.mainProduct.상품명}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {productRefsByName[group.mainProduct.상품명]?.품목코드 ?? '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {productRefsByName[group.mainProduct.상품명]?.품번 ?? '-'}
                        </td>
                       
                        
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 ">
                          {group.mainProduct.수량.toLocaleString()}개
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                          ₩{formatCurrency(group.mainProduct.매출금액)}
                        </td>
                      </tr>
                      {/* 사이즈 상품들 */}
                      {group.sizeProducts.map((sizeProduct, sizeIndex) => (
                        <tr key={`${group.mainProduct.상품명}-${sizeIndex}`} className="hover:bg-gray-50">
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-400">
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600 pl-8">
                            - {sizeProduct.상품명}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                          {productRefsByName[sizeProduct.상품명]?.품목코드 ?? '-'}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                          {productRefsByName[sizeProduct.상품명]?.품번 ?? productRefsByName[group.mainProduct.상품명]?.품번 ?? '-'}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                            수량: {sizeProduct.수량}개
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                            ₩{formatCurrency(sizeProduct.매출금액)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* 요약 정보 */}
            <div className="bg-gray-50 px-6 py-8">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-md">
                <div>
                  <span className="text-gray-500 ">총 상품 수:</span>
                  <span className="ml-2 font-semibold ">{groupedData.length}개</span>
                </div>
                <div>
                  <span className="text-gray-500 ">총 수량:</span>
                  <span className="ml-2 font-semibold ">
                    {groupedData.reduce((sum, group) => sum + group.mainProduct.수량, 0).toLocaleString()}개
                  </span>
                </div>
                <div>
                  <span className="text-gray-500  ">판매 금액:</span>
                  <span className="ml-2 font-semibold ">₩{formatCurrency(totalSaleAmount)}</span>
                </div>
                <div>
                  <span className="text-gray-500 ">포인트 사용 금액:</span>
                  <span className="ml-2 font-semibold  text-blue-600 ">₩{formatCurrency(pointUsageAmount)}</span>
                </div>
                <div>
                  <span className="text-gray-500 ">총매출:</span>
                  <span className="ml-2 font-semibold text-green-600 ">₩{formatCurrency(totalPaidAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
