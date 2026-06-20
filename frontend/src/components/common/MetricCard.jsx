import React from 'react';

const MetricCard = ({ title, value, subtitle, highlight = false, icon }) => {
  return (
    <div className="bg-[#0A120E] border border-white/5 hover:border-white/10 transition-all duration-300 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
      {/* Subtle hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div className="relative z-10 flex items-center justify-between mb-4">
        <h3 className="text-gray-400 font-medium text-sm tracking-wide">{title}</h3>
        {icon && <div className="bg-white/5 p-2 rounded-lg">{icon}</div>}
      </div>
      
      <div className="relative z-10">
        <div className={`text-3xl font-bold tracking-tight ${highlight ? 'text-[#AEE7B1]' : 'text-white'}`}>
          {value}
        </div>
        {subtitle && (
          <div className="text-xs text-gray-500 mt-2">{subtitle}</div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;