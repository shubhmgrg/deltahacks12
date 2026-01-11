import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Plane, Leaf, Clock, Users, TrendingUp, Zap, Shield, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TripBar from '@/components/TripBar';

export default function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const statsRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  const statsInView = useInView(statsRef, { once: true, margin: '-100px' });

  // Animated counter
  const [counters, setCounters] = useState({ flights: 0, co2: 0, fuel: 0 });
  const targetCounters = { flights: 1247, co2: 342, fuel: 1250 };

  useEffect(() => {
    if (statsInView) {
      const duration = 2000;
      const steps = 60;
      const interval = duration / steps;

      const timers = Object.keys(targetCounters).map((key) => {
        const target = targetCounters[key];
        let current = 0;
        const increment = target / steps;

        const timer = setInterval(() => {
          current += increment;
          if (current >= target) {
            current = target;
            clearInterval(timer);
          }
          setCounters((prev) => ({ ...prev, [key]: Math.floor(current) }));
        }, interval);

        return timer;
      });

      return () => timers.forEach(clearInterval);
    }
  }, [statsInView]);

  const handleTryDemo = () => {
    navigate('/app');
  };

  const handleOpenApp = () => {
    navigate('/app');
  };

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  const staggerContainer = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/transparent%20skysync.png" alt="SkySync" className="h-8 w-auto" />
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              SkySync
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleOpenApp} className="text-slate-300 hover:text-white">
              Features
            </Button>
            <Button variant="ghost" onClick={handleOpenApp} className="text-slate-300 hover:text-white">
              About
            </Button>
            <Button variant="outline" onClick={handleOpenApp} className="border-slate-700 hover:bg-slate-800">
              Open App
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <motion.section
        ref={heroRef}
        style={{ y: heroY, opacity: heroOpacity }}
        className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-20 overflow-hidden"
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full">
          <motion.div
            initial="initial"
            animate="animate"
            variants={staggerContainer}
            className="text-center space-y-8"
          >
            <motion.h1
              variants={fadeInUp}
              className="text-5xl md:text-7xl font-bold leading-tight"
            >
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Sync Flights,
              </span>
              <br />
              <span className="text-white">Save the Planet</span>
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto"
            >
              Find optimal flight formations to reduce fuel consumption and CO₂ emissions.
              Join the future of sustainable aviation.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
            >
              <Button
                size="lg"
                onClick={handleTryDemo}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-8 py-6 text-lg"
              >
                Try Demo
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleOpenApp}
                className="border-slate-700 hover:bg-slate-800 px-8 py-6 text-lg"
              >
                Open App
              </Button>
            </motion.div>

            {/* Trip Bar - Floating Card */}
            <motion.div
              variants={fadeInUp}
              className="pt-12"
            >
              <TripBar />
            </motion.div>

            {/* Metric Counter Row */}
            <motion.div
              ref={statsRef}
              variants={fadeInUp}
              className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-16 max-w-4xl mx-auto"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={statsInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold text-blue-400 mb-2">
                  {counters.flights}+
                </div>
                <div className="text-sm text-slate-400 uppercase tracking-wider">Flights Matched</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={statsInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold text-emerald-400 mb-2">
                  {counters.co2}+
                </div>
                <div className="text-sm text-slate-400 uppercase tracking-wider">Tons CO₂ Saved</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={statsInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold text-cyan-400 mb-2">
                  {counters.fuel}+
                </div>
                <div className="text-sm text-slate-400 uppercase tracking-wider">Tons Fuel Saved</div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      {/* How It Works Section */}
      <section className="py-24 px-6 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Our advanced algorithm matches flights with similar routes and schedules
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Plane className="h-8 w-8" />,
                title: 'Find Matches',
                description: 'Our system analyzes thousands of flights to find optimal formation opportunities.',
                iconBg: 'bg-blue-500/10',
                iconColor: 'text-blue-400',
              },
              {
                icon: <Plane className="h-8 w-8" />,
                title: 'Form Formation',
                description: 'Flights sync up in the air, with one leading and the other following in the slipstream.',
                iconBg: 'bg-cyan-500/10',
                iconColor: 'text-cyan-400',
              },
              {
                icon: <Leaf className="h-8 w-8" />,
                title: 'Save Resources',
                description: 'Reduce fuel consumption and CO₂ emissions by up to 7% per flight formation.',
                iconBg: 'bg-emerald-500/10',
                iconColor: 'text-emerald-400',
              },
            ].map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors h-full">
                  <CardContent className="p-8 text-center">
                    <div className={`inline-flex p-4 rounded-xl ${step.iconBg} ${step.iconColor} mb-4`}>
                      {step.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-3">{step.title}</h3>
                    <p className="text-slate-400">{step.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Features</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Everything you need to optimize flight formations
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Clock className="h-6 w-6" />,
                title: 'Real-time Matching',
                description: 'Get instant flight formation opportunities',
              },
              {
                icon: <TrendingUp className="h-6 w-6" />,
                title: 'Performance Analytics',
                description: 'Track fuel savings and emissions reduction',
              },
              {
                icon: <Zap className="h-6 w-6" />,
                title: 'Fast Processing',
                description: 'Advanced algorithms for quick results',
              },
              {
                icon: <Shield className="h-6 w-6" />,
                title: 'Safety First',
                description: 'All formations meet strict safety standards',
              },
              {
                icon: <Globe className="h-6 w-6" />,
                title: 'Global Coverage',
                description: 'Works with flights worldwide',
              },
              {
                icon: <Users className="h-6 w-6" />,
                title: 'Multi-airline',
                description: 'Compatible across different airlines',
              },
              {
                icon: <Leaf className="h-6 w-6" />,
                title: 'Carbon Credits',
                description: 'Earn credits for reduced emissions',
              },
              {
                icon: <Plane className="h-6 w-6" />,
                title: 'Flight Replay',
                description: 'Visualize formations in 3D',
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors h-full">
                  <CardContent className="p-6">
                    <div className="text-blue-400 mb-3">{feature.icon}</div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-slate-400">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 px-6 bg-gradient-to-r from-blue-600/20 to-cyan-600/20">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Ready to Sync Your Flights?
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Join thousands of airlines reducing emissions through smart flight formations
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={handleTryDemo}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-8 py-6 text-lg"
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleOpenApp}
                className="border-slate-700 hover:bg-slate-800 px-8 py-6 text-lg"
              >
                Learn More
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-slate-400 text-sm">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <img src="/transparent%20skysync.png" alt="SkySync" className="h-6 w-auto" />
            <span>SkySync © 2024</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
