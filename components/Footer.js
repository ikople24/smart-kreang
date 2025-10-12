import { Globe, ContactRound, Facebook ,  } from "lucide-react";


export default function Footer() {
  return (
    <footer className="bg-white/30 text-gray-800 text-sm py-3 px-4 backdrop-blur-md border-t border-gray-300 flex justify-between items-center">
      <div>© 2025 smart-kreang — All rights reserved</div>
      <div className="flex gap-4 text-lg">
        <a href="https://www.kreang.go.th/index.php" className="hover:text-[#1DA1F2] transition-colors duration-200"><Globe size={20} strokeWidth={1.5} /></a>
        <a href="#" className="hover:text-[#67ff49] transition-colors duration-200"><ContactRound size={20} strokeWidth={1.5} /></a>
        <a href="https://www.facebook.com/profile.php?id=100018836315352" className="hover:text-[#1877F2] transition-colors duration-200"><Facebook size={20} strokeWidth={1.5} /></a>
      </div>
    </footer>
  );
}