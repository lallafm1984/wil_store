"use client";

import React, { useState, createContext, useContext } from 'react';
import Sidebar from './Sidebar';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

function LayoutContentInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="flex">
      <Sidebar />
      <main className={`flex-1 min-h-screen bg-gray-50 transition-all duration-300 ${
        collapsed ? 'ml-16' : 'ml-64'
      }`}>
        {children}
      </main>
    </div>
  );
}

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <LayoutContentInner>
        {children}
      </LayoutContentInner>
    </SidebarContext.Provider>
  );
} 