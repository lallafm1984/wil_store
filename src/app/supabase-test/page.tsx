"use client";

import React, { useState, useEffect } from 'react';
import { testSupabaseConnection, getDatabaseInfo, checkEnvironmentVariables } from '@/lib/supabase';

interface ConnectionResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: any;
  data?: any;
}

export default function SupabaseTestPage() {
  const [connectionResult, setConnectionResult] = useState<ConnectionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [envVars, setEnvVars] = useState(() => {
    const env = checkEnvironmentVariables();
    return {
      url: env.url || '설정되지 않음',
      key: env.key ? '설정됨' : '설정되지 않음',
      isConfigured: env.isConfigured
    };
  });

  const testConnection = async () => {
    setIsLoading(true);
    try {
      const result = await testSupabaseConnection();
      setConnectionResult(result);
      
      // 추가로 데이터베이스 정보도 확인
      if (result.success) {
        const dbInfo = await getDatabaseInfo();
        if (dbInfo.success) {
          setConnectionResult({
            ...result,
            details: {
              ...result.details,
              databaseInfo: dbInfo.details
            }
          });
        }
      }
    } catch (error) {
      setConnectionResult({
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 페이지 로드 시 자동으로 연결 테스트
    testConnection();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Supabase 연결 테스트</h1>
        
        {/* 환경 변수 상태 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">환경 변수 상태</h2>
          <div className="space-y-2">
            <div className="flex items-center">
              <span className="font-medium text-gray-700 w-32">SUPABASE_URL:</span>
              <span className={`px-2 py-1 rounded text-sm ${
                envVars.url !== '설정되지 않음' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {envVars.url}
              </span>
            </div>
            <div className="flex items-center">
              <span className="font-medium text-gray-700 w-32">SUPABASE_ANON_KEY:</span>
              <span className={`px-2 py-1 rounded text-sm ${
                envVars.key !== '설정되지 않음' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {envVars.key}
              </span>
            </div>
            <div className="flex items-center">
              <span className="font-medium text-gray-700 w-32">설정 상태:</span>
              <span className={`px-2 py-1 rounded text-sm ${
                envVars.isConfigured 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {envVars.isConfigured ? '완료' : '미완료'}
              </span>
            </div>
          </div>
        </div>

        {/* 연결 테스트 결과 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">연결 테스트 결과</h2>
            <button
              onClick={testConnection}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '테스트 중...' : '다시 테스트'}
            </button>
          </div>

          {connectionResult && (
            <div className={`p-4 rounded-lg ${
              connectionResult.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center mb-2">
                <div className={`w-3 h-3 rounded-full mr-2 ${
                  connectionResult.success ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span className={`font-medium ${
                  connectionResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {connectionResult.success ? '연결 성공' : '연결 실패'}
                </span>
              </div>
              
              {connectionResult.message && (
                <p className="text-sm text-gray-700 mb-2">{connectionResult.message}</p>
              )}
              
              {connectionResult.error && (
                <p className="text-sm text-red-700 mb-2">{connectionResult.error}</p>
              )}
              
              {connectionResult.details && (
                <div className="mt-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">상세 정보:</h4>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                    {JSON.stringify(connectionResult.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 설정 가이드 */}
        <div className="bg-blue-50 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">Supabase 설정 가이드</h2>
          <div className="space-y-4 text-sm text-blue-800">
            <div>
              <h3 className="font-medium mb-2">1. Supabase 프로젝트 생성</h3>
              <p>• <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">Supabase</a>에서 새 프로젝트를 생성하세요.</p>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">2. 환경 변수 설정</h3>
              <p>프로젝트 루트에 <code className="bg-blue-100 px-1 rounded">.env.local</code> 파일을 생성하고 다음을 추가하세요:</p>
              <pre className="bg-blue-100 p-2 rounded mt-2 text-xs">
{`NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key`}
              </pre>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">3. 프로젝트 설정에서 확인</h3>
              <p>• Supabase 대시보드 → Settings → API에서 URL과 anon key를 확인하세요.</p>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">4. 개발 서버 재시작</h3>
              <p>환경 변수를 설정한 후 개발 서버를 재시작하세요:</p>
              <code className="bg-blue-100 px-2 py-1 rounded text-xs">npm run dev</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 