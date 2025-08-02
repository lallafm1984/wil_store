'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

interface ExcelData {
  [key: string]: any;
}

interface Statistics {
  totalRows: number;
  totalColumns: number;
  columnNames: string[];
  numericColumns: string[];
  summaryStats: { [key: string]: { min: number; max: number; avg: number; sum: number } };
  valueCounts: { [key: string]: { [key: string]: number } };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function StatisticsPage() {
  const [excelData, setExcelData] = useState<ExcelData[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as ExcelData[];
        
        setExcelData(jsonData);
        calculateStatistics(jsonData);
      } catch (error) {
        console.error('파일 처리 중 오류가 발생했습니다:', error);
        alert('파일을 처리하는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const calculateStatistics = (data: ExcelData[]) => {
    if (data.length === 0) return;

    const columnNames = Object.keys(data[0]);
    const numericColumns: string[] = [];
    const summaryStats: { [key: string]: { min: number; max: number; avg: number; sum: number } } = {};
    const valueCounts: { [key: string]: { [key: string]: number } } = {};

    // 각 컬럼에 대한 통계 계산
    columnNames.forEach(column => {
      const values = data.map(row => row[column]).filter(val => val !== undefined && val !== null);
      
      // 값 개수 계산
      valueCounts[column] = {};
      values.forEach(value => {
        const strValue = String(value);
        valueCounts[column][strValue] = (valueCounts[column][strValue] || 0) + 1;
      });

      // 숫자 컬럼인지 확인하고 통계 계산
      const numericValues = values.filter(val => !isNaN(Number(val)) && val !== '');
      if (numericValues.length > 0) {
        numericColumns.push(column);
        const numbers = numericValues.map(val => Number(val));
        summaryStats[column] = {
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          avg: numbers.reduce((sum, num) => sum + num, 0) / numbers.length,
          sum: numbers.reduce((sum, num) => sum + num, 0)
        };
      }
    });

    setStatistics({
      totalRows: data.length,
      totalColumns: columnNames.length,
      columnNames,
      numericColumns,
      summaryStats,
      valueCounts
    });
  };

  const renderBarChart = (columnName: string) => {
    const counts = statistics?.valueCounts[columnName];
    if (!counts) return null;

    const chartData = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    return (
      <div className="bg-white p-4 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-4">{columnName} - 상위 10개 값</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderPieChart = (columnName: string) => {
    const counts = statistics?.valueCounts[columnName];
    if (!counts) return null;

    const chartData = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));

    return (
      <div className="bg-white p-4 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-4">{columnName} - 분포</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderLineChart = (columnName: string) => {
    const stats = statistics?.summaryStats[columnName];
    if (!stats) return null;

    const chartData = [
      { name: '최소값', value: stats.min },
      { name: '평균값', value: stats.avg },
      { name: '최대값', value: stats.max }
    ];

    return (
      <div className="bg-white p-4 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-4">{columnName} - 통계 요약</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">엑셀 파일 통계 분석</h1>
          <p className="text-gray-600">엑셀 파일을 업로드하여 데이터 통계를 확인하세요</p>
        </div>

        {/* 파일 업로드 섹션 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                </svg>
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">클릭하여 파일 업로드</span> 또는 드래그 앤 드롭
                </p>
                <p className="text-xs text-gray-500">Excel 파일 (.xlsx, .xls)</p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </label>
          </div>
          {fileName && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">업로드된 파일: {fileName}</p>
            </div>
          )}
          {isLoading && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                파일 처리 중...
              </div>
            </div>
          )}
        </div>

        {/* 통계 요약 */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">총 행 수</h3>
              <p className="text-3xl font-bold text-blue-600">{statistics.totalRows.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">총 컬럼 수</h3>
              <p className="text-3xl font-bold text-green-600">{statistics.totalColumns}</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">숫자 컬럼</h3>
              <p className="text-3xl font-bold text-purple-600">{statistics.numericColumns.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">텍스트 컬럼</h3>
              <p className="text-3xl font-bold text-orange-600">{statistics.totalColumns - statistics.numericColumns.length}</p>
            </div>
          </div>
        )}

        {/* 차트 섹션 */}
        {statistics && (
          <div className="space-y-8">
            {/* 숫자 컬럼 통계 */}
            {statistics.numericColumns.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">숫자 데이터 통계</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {statistics.numericColumns.map(column => (
                    <div key={column} className="bg-white rounded-lg shadow-md p-6">
                      <h3 className="text-xl font-semibold mb-4">{column}</h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-600">최소값</p>
                          <p className="text-lg font-semibold">{statistics.summaryStats[column].min.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">최대값</p>
                          <p className="text-lg font-semibold">{statistics.summaryStats[column].max.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">평균값</p>
                          <p className="text-lg font-semibold">{statistics.summaryStats[column].avg.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">합계</p>
                          <p className="text-lg font-semibold">{statistics.summaryStats[column].sum.toLocaleString()}</p>
                        </div>
                      </div>
                      {renderLineChart(column)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 카테고리 데이터 차트 */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">카테고리 데이터 분석</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {statistics.columnNames.slice(0, 6).map(column => (
                  <div key={column}>
                    {renderBarChart(column)}
                  </div>
                ))}
              </div>
            </div>

            {/* 파이 차트 섹션 */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">데이터 분포</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {statistics.columnNames.slice(0, 4).map(column => (
                  <div key={column}>
                    {renderPieChart(column)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 