'use client';

import { useEffect } from 'react';

import { markRepresentationsSeenAction } from '../actions';

export function MarkRepresentationsSeen() {
  useEffect(() => {
    markRepresentationsSeenAction();
  }, []);

  return null;
}
