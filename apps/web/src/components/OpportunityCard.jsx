import React from 'react';
import { formatCategoryName, computeDaysRemaining } from '../utils/formatters.js';

/**
 * Reusable Opportunity Card Component
 */
export function OpportunityCard({ opportunity, onClick, onShare }) {
  if (!opportunity) return null;
  const daysLeft = computeDaysRemaining(opportunity.deadline);

  return (
    <div
      onClick={onClick}
      class="card-hover-lift bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs cursor-pointer flex flex-col justify-between space-y-4 group transition-all"
    >
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-0.5 text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
            {formatCategoryName(opportunity.category)}
          </span>
          {opportunity.featured ? (
            <span class="px-2 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-900 rounded-md shadow-2xs">
              FEATURED ⭐
            </span>
          ) : null}
        </div>

        <h3 class="font-display font-bold text-lg text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
          {opportunity.title}
        </h3>

        <p class="text-xs text-slate-500 font-semibold">
          {opportunity.org_name} • {opportunity.location}
        </p>

        <p class="text-xs text-slate-600 line-clamp-2">
          {opportunity.description}
        </p>
      </div>

      <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <span class="font-extrabold text-emerald-600">{opportunity.stipend_or_prize}</span>
        <span class="text-slate-400 font-medium">⏳ {daysLeft} Days Left</span>
      </div>
    </div>
  );
}
