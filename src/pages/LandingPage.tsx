import { Box, Palette, Ruler, Download, Cloud, Zap } from 'lucide-react';
import { Navbar1 } from '@/components/blocks/navbar1';
import { ShimmerText } from '@/components/ui/shimmer-text';
import { motion } from 'motion/react';

const navbarData = {
  logo: {
    url: "/",
    title: "FurnitureDesigner",
  },
  menu: [
    { title: "Features", url: "#features" },
    {
      title: "Products",
      url: "#",
      items: [
        {
          title: "3D Editor",
          description: "Design and visualize furniture in stunning 3D",
          icon: <Box className="size-5 shrink-0" />,
          url: "/configurator",
        },
        {
          title: "Material Library",
          description: "Hundreds of materials, colors, and textures",
          icon: <Palette className="size-5 shrink-0" />,
          url: "#features",
        },
        {
          title: "Precision Tools",
          description: "Accurate measurements for professional results",
          icon: <Ruler className="size-5 shrink-0" />,
          url: "#features",
        },
        {
          title: "DXF Export",
          description: "Export designs in DXF format for manufacturing",
          icon: <Download className="size-5 shrink-0" />,
          url: "#features",
        },
      ],
    },
    {
      title: "Resources",
      url: "#",
      items: [
        {
          title: "Help Center",
          description: "Get all the answers you need right here",
          icon: <Zap className="size-5 shrink-0" />,
          url: "#",
        },
        {
          title: "Cloud Storage",
          description: "Save and access your projects from anywhere",
          icon: <Cloud className="size-5 shrink-0" />,
          url: "#",
        },
      ],
    },
    { title: "Demo", url: "#demo" },
    { title: "Pricing", url: "#pricing" },
  ],
  mobileExtraLinks: [
    { name: "About", url: "#" },
    { name: "Contact", url: "#" },
    { name: "Privacy", url: "#" },
    { name: "Terms", url: "#" },
  ],
  auth: {
    login: { text: "Login", url: "/login" },
    signup: { text: "Sign Up", url: "/signup" },
  },
};

export default function LandingPage() {
  return (
    <div className="bg-zinc-950 min-h-screen">
      <Navbar1 {...navbarData} />
      <div className="flex items-center justify-center px-8" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="text-center">
        {/* Three Dots + think thing thank */}
        <div className="flex items-center justify-center gap-6 mb-10">
          <div className="flex items-center gap-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full bg-white"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.15,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
          <ShimmerText
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white"
            duration={2}
            delay={1}
          >
            think thing thank
          </ShimmerText>
        </div>

        {/* craft */}
        <motion.h1
          className="text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] font-black text-white tracking-tighter leading-none"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
        >
          craft
        </motion.h1>
        </div>
      </div>
    </div>
  );
}
