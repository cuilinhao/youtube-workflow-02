'use client';

export function Footer() {
  return (
    <footer className="fixed bottom-0 left-[300px] right-0 border-t border-gray-200 bg-white/80 backdrop-blur-xl">
      <div className="flex items-center justify-center gap-6 px-6 py-3 text-xs text-gray-500">
        <span>© 2025 Nano Banana. All rights reserved.</span>
        <a href="#" className="hover:text-gray-900 transition-colors">
          Terms
        </a>
        <a href="#" className="hover:text-gray-900 transition-colors">
          Privacy
        </a>
        <a href="#" className="hover:text-gray-900 transition-colors">
          About
        </a>
      </div>
    </footer>
  );
}
