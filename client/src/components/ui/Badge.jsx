import React from 'react';

export function Badge({ children, variant = 'default', size = 'md', className = '' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    running: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variants[variant] || variants.default} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, className = '' }) {
  switch (status?.toLowerCase()) {
    case 'running':
      return <Badge variant="running" className={className}>Running</Badge>;
    case 'queued':
      return <Badge variant="purple" className={className}>Queued</Badge>;
    case 'completed':
      return <Badge variant="success" className={className}>Completed</Badge>;
    case 'failed':
      return <Badge variant="danger" className={className}>Failed</Badge>;
    case 'idle':
    default:
      return <Badge variant="default" className={className}>Idle</Badge>;
  }
}
