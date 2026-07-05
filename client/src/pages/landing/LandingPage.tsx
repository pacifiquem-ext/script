import React from 'react';
import { Hero } from '../../components/landing/Hero';
import { Services } from '../../components/landing/Services';
import { GetStarted } from '../../components/landing/GetStarted';

export function LandingPage() {
  return (
    <main>
      <Hero />
      <Services />
      <GetStarted />
    </main>
  );
}
