import { Book, Menu, Sunset, Trees, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-[1400px] mx-auto px-8">
        <nav className="hidden justify-between lg:flex h-16">
          <div className="flex items-center gap-6">
            <Link to={logo.url} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold">
                F
              </div>
              <span className="text-lg font-semibold text-white">{logo.title}</span>
            </Link>
            <div className="flex items-center">
              <NavigationMenu>
                <NavigationMenuList>
                  {menu.map((item) => renderMenuItem(item))}
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full px-4"
              onClick={() => navigate(auth.login.url)}
            >
              {auth.login.text}
            </Button>
            <Button
              size="sm"
              className="bg-white text-zinc-900 hover:bg-zinc-200 rounded-full px-5"
              onClick={() => navigate(auth.signup.url)}
            >
              {auth.signup.text}
            </Button>
          </div>
        </nav>
        <div className="block lg:hidden">
          <div className="flex items-center justify-between h-16">
            <Link to={logo.url} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold">
                F
              </div>
              <span className="text-lg font-semibold text-white">{logo.title}</span>
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
                    <Link to={logo.url} className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold">
                        F
                      </div>
                      <span className="text-lg font-semibold text-white">
                        {logo.title}
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
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-full"
                      onClick={() => navigate(auth.login.url)}
                    >
                      {auth.login.text}
                    </Button>
                    <Button
                      className="bg-white text-zinc-900 hover:bg-zinc-200 rounded-full"
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

const renderMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <NavigationMenuItem key={item.title} className="text-zinc-400">
        <NavigationMenuTrigger className="bg-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-white data-[state=open]:bg-zinc-800/50 data-[state=open]:text-white">
          {item.title}
        </NavigationMenuTrigger>
        <NavigationMenuContent className="bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-xl">
          <ul className="w-48 p-2">
            <NavigationMenuLink>
              {item.items.map((subItem) => (
                <li key={subItem.title}>
                  <a
                    className="block select-none rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                    href={subItem.url}
                  >
                    {subItem.title}
                  </a>
                </li>
              ))}
            </NavigationMenuLink>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    );
  }

  return (
    <a
      key={item.title}
      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
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
