"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './LayoutContent';

interface MenuItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  description?: string;
}

const menuItems: MenuItem[] = [
  {
    name: '무인매장 매출',
    href: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h4l3 8 4-16 3 8h4" />
      </svg>
    ),
    description: '무인매장 매출 엑셀 변환'
  },
  {
    name: '정산결과 검토',
    href: '/settlement-review',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v2h6v-2M12 3v12m0 0l3-3m-3 3l-3-3" />
      </svg>
    ),
    description: '두 엑셀 비교'
  }
];

export default function Sidebar() {
  const { collapsed, setCollapsed } = useSidebar();
  const pathname = usePathname();

  return (
    <div className={`bg-gray-900 text-white transition-all duration-300 ${
      collapsed ? 'w-16' : 'w-64'
    } min-h-screen fixed left-0 top-0 z-50`}>
      {/* 사이드바 헤더 */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <h1 className="text-xl font-bold text-white">
              WIL Store
            </h1>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* 메뉴 아이템들 */}
      <nav className="mt-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-4 py-3 transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                  title={collapsed ? item.description : undefined}
                >
                  <span className="flex-shrink-0">
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <span className="ml-3 font-medium">
                      {item.name}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 사이드바 푸터 */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <div className="text-xs text-gray-400">
            <p>WIL Store Admin</p>
            <p>v1.0.0</p>
          </div>
        </div>
      )}
    </div>
  );
} 