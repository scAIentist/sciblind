export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your blind comparison studies
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {/* Stats Cards */}
          <div className="border rounded-lg p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Total Studies
            </h3>
            <p className="text-3xl font-bold">0</p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Active Studies
            </h3>
            <p className="text-3xl font-bold">0</p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Total Comparisons
            </h3>
            <p className="text-3xl font-bold">0</p>
          </div>
        </div>

        <div className="border rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Your Studies</h2>
            <a
              href="/admin/studies/new"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Create New Study
            </a>
          </div>

          {/* Empty State */}
          <div className="text-center py-12 text-muted-foreground">
            <svg
              className="mx-auto h-12 w-12 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <h3 className="text-lg font-medium mb-2">No studies yet</h3>
            <p className="mb-4">Get started by creating your first blind comparison study</p>
            <a
              href="/admin/studies/new"
              className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Create Your First Study
            </a>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <a
            href="/"
            className="border rounded-lg p-4 hover:bg-accent transition-colors"
          >
            <h3 className="font-medium mb-1">← Back to Home</h3>
            <p className="text-sm text-muted-foreground">
              Return to landing page
            </p>
          </a>
          <a
            href="#"
            className="border rounded-lg p-4 hover:bg-accent transition-colors opacity-50 cursor-not-allowed"
          >
            <h3 className="font-medium mb-1">Documentation</h3>
            <p className="text-sm text-muted-foreground">
              Coming soon
            </p>
          </a>
          <a
            href="#"
            className="border rounded-lg p-4 hover:bg-accent transition-colors opacity-50 cursor-not-allowed"
          >
            <h3 className="font-medium mb-1">Settings</h3>
            <p className="text-sm text-muted-foreground">
              Coming soon
            </p>
          </a>
        </div>
      </div>
    </div>
  );
}
