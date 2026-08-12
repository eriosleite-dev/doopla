'use client';

import { useEffect } from 'react';

import { markOpportunitiesSeenAction } from '../actions';

export function MarkOpportunitiesSeen() {
  useEffect(() => {
    markOpportunitiesSeenAction();
  }, []);

  return null;
}
