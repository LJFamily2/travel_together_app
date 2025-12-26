import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full">
        <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="w-8 h-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-red-600 mb-2">
          404 — Page not found
        </h1>
        <p className="text-gray-500 mb-8">
          The page you're looking for doesn't exist.
        </p>
        <Link
          href="/"
          className="w-full inline-block bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
