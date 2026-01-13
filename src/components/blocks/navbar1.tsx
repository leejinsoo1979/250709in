import * as React from "react";
import { Menu, ChevronDown, Palette, Book, Trees, Sunset, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme, ThemeColor } from "@/contexts/ThemeContext";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface MenuItem {
  title: string;
  url: string;
  description?: string;
  icon?: JSX.Element;
  items?: MenuItem[];
}

interface Navbar1Props {
  logo?: {
    url: string;
    title: string;
  };
  menu?: MenuItem[];
  mobileExtraLinks?: {
    name: string;
    url: string;
  }[];
  auth?: {
    login: {
      text: string;
      url: string;
    };
    signup: {
      text: string;
      url: string;
    };
  };
}

const Navbar1 = ({
  logo = {
    url: "/",
    title: "FurnitureDesigner",
  },
  menu = [
    { title: "Home", url: "#" },
    {
      title: "Products",
      url: "#",
      items: [
        {
          title: "Blog",
          description: "The latest industry news, updates, and info",
          icon: <Book className="size-5 shrink-0" />,
          url: "#",
        },
        {
          title: "Company",
          description: "Our mission is to innovate and empower the world",
          icon: <Trees className="size-5 shrink-0" />,
          url: "#",
        },
        {
          title: "Careers",
          description: "Browse job listing and discover our workspace",
          icon: <Sunset className="size-5 shrink-0" />,
          url: "#",
        },
        {
          title: "Support",
          description:
            "Get in touch with our support team or visit our community forums",
          icon: <Zap className="size-5 shrink-0" />,
          url: "#",
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
          title: "Contact Us",
          description: "We are here to help you with any questions you have",
          icon: <Sunset className="size-5 shrink-0" />,
          url: "#",
        },
        {
          title: "Status",
          description: "Check the current status of our services and APIs",
          icon: <Trees className="size-5 shrink-0" />,
          url: "#",
        },
        {
          title: "Terms of Service",
          description: "Our terms and conditions for using our services",
          icon: <Book className="size-5 shrink-0" />,
          url: "#",
        },
      ],
    },
    {
      title: "Pricing",
      url: "#",
    },
    {
      title: "Blog",
      url: "#",
    },
  ],
  mobileExtraLinks = [
    { name: "Press", url: "#" },
    { name: "Contact", url: "#" },
    { name: "Imprint", url: "#" },
    { name: "Sitemap", url: "#" },
  ],
  auth = {
    login: { text: "Log in", url: "/login" },
    signup: { text: "Sign up", url: "/signup" },
  },
}: Navbar1Props) => {
  const navigate = useNavigate();
  const { theme, setThemeColor } = useTheme();
  const [isThemeOpen, setIsThemeOpen] = React.useState(false);

  const themeColors: { id: ThemeColor; color: string }[] = [
    { id: 'blue', color: '#3b82f6' },
    { id: 'purple', color: '#8b5cf6' },
    { id: 'green', color: '#10b981' },
    { id: 'pink', color: '#ec4899' },
    { id: 'red', color: '#D2042D' },
    { id: 'teal', color: '#14b8a6' },
    { id: 'indigo', color: '#6366f1' },
    { id: 'yellow', color: '#eab308' },
  ];

  const primaryColor = themeColors.find(c => c.id === theme.color)?.color || '#3b82f6';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-[1400px] mx-auto px-8">
        <nav className="hidden lg:flex h-16 items-center">
          <div className="flex items-center">
            <Link to={logo.url} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xl"
                style={{ backgroundColor: primaryColor }}
              >
                m
              </div>
              <span style={{ color: primaryColor }} className="font-medium text-lg tracking-wide">
                LOGO
              </span>
            </Link>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-1">
              {menu.map((item) => (
                <DropdownMenuItem key={item.title} item={item} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:opacity-80"
                onClick={() => setIsThemeOpen(!isThemeOpen)}
                style={{
                  background: 'transparent',
                  border: `1.5px solid ${primaryColor}`
                }}
              >
                <Palette className="size-4" style={{ color: primaryColor }} />
              </button>
              {isThemeOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsThemeOpen(false)}
                  />
                  <div
                    className="absolute right-0 top-full z-50 rounded-xl shadow-2xl"
                    style={{
                      marginTop: '12px',
                      padding: '16px',
                      backgroundColor: 'rgb(24, 24, 27)',
                      border: '1px solid rgb(63, 63, 70)',
                      minWidth: '180px'
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      {themeColors.map((c) => (
                        <button
                          key={c.id}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: c.color,
                            border: theme.color === c.id ? '3px solid white' : '2px solid transparent',
                            cursor: 'pointer',
                            transition: 'transform 0.15s ease',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          onClick={() => {
                            setThemeColor(c.id);
                            setIsThemeOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-5 hover:opacity-80"
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${primaryColor}`,
                color: primaryColor
              }}
              onClick={() => navigate(auth.login.url)}
            >
              {auth.login.text}
            </Button>
            <Button
              size="sm"
              className="text-white hover:opacity-90 rounded-full px-5"
              style={{ backgroundColor: primaryColor }}
              onClick={() => navigate(auth.signup.url)}
            >
              {auth.signup.text}
            </Button>
          </div>
        </nav>
        <div className="block lg:hidden">
          <div className="flex items-center justify-between h-16">
            <Link to={logo.url} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xl"
                style={{ backgroundColor: primaryColor }}
              >
                m
              </div>
              <span style={{ color: primaryColor }} className="font-medium text-lg tracking-wide">
                LOGO
              </span>
            </Link>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto bg-zinc-950 border-zinc-800">
                <SheetHeader>
                  <SheetTitle>
                    <Link to={logo.url} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xl"
                        style={{ backgroundColor: primaryColor }}
                      >
                        m
                      </div>
                      <span style={{ color: primaryColor }} className="font-medium text-lg tracking-wide">
                        LOGO
                      </span>
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <div className="my-6 flex flex-col gap-6">
                  <Accordion
                    type="single"
                    collapsible
                    className="flex w-full flex-col gap-4"
                  >
                    {menu.map((item) => renderMobileMenuItem(item))}
                  </Accordion>
                  <div className="border-t border-zinc-800 py-4">
                    <div className="grid grid-cols-2 justify-start">
                      {mobileExtraLinks.map((link, idx) => (
                        <a
                          key={idx}
                          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                          href={link.url}
                        >
                          {link.name}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button
                      variant="outline"
                      className="hover:bg-zinc-800/50 rounded-full"
                      style={{ borderColor: primaryColor, color: primaryColor }}
                      onClick={() => navigate(auth.login.url)}
                    >
                      {auth.login.text}
                    </Button>
                    <Button
                      className="text-white hover:opacity-90 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                      onClick={() => navigate(auth.signup.url)}
                    >
                      {auth.signup.text}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

const DropdownMenuItem = ({ item }: { item: MenuItem }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (item.items) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <button
          className="inline-flex h-10 items-center gap-1 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          {item.title}
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div
            className="absolute left-0 top-full z-50 pt-2"
          >
            <ul
              className="w-48 rounded-xl p-2 shadow-2xl list-none m-0 !bg-zinc-950 border border-zinc-800"
              style={{ backgroundColor: '#09090b', border: '1px solid #27272a' }}
            >
              {item.items.map((subItem) => (
                <li key={subItem.title} className="m-0 p-0">
                  <span
                    onClick={() => window.location.href = subItem.url}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer hover:bg-zinc-800 !text-zinc-200 transition-colors"
                    style={{ color: '#e4e4e7' }}
                  >
                    {subItem.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <a
      className="inline-flex h-10 items-center px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      href={item.url}
    >
      {item.title}
    </a>
  );
};

const renderMobileMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <AccordionItem key={item.title} value={item.title} className="border-b-0 border-zinc-800">
        <AccordionTrigger className="py-0 font-semibold hover:no-underline text-zinc-200 hover:text-white">
          {item.title}
        </AccordionTrigger>
        <AccordionContent className="mt-2">
          {item.items.map((subItem) => (
            <a
              key={subItem.title}
              className="block select-none rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              href={subItem.url}
            >
              {subItem.title}
            </a>
          ))}
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <a key={item.title} href={item.url} className="font-semibold text-zinc-200 hover:text-white">
      {item.title}
    </a>
  );
};

export { Navbar1 };
