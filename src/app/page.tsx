export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-24">
      <div className="max-w-4xl text-center space-y-6">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          SciBLIND
        </h1>
        <p className="text-2xl text-muted-foreground">
          Scientifically Rigorous Blind Comparison Platform
        </p>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          A production-ready platform for conducting blind pairwise comparisons and rankings
          with military-grade security to prevent manipulation and bias.
        </p>
        <div className="flex gap-4 justify-center mt-8">
          <a
            href="/admin"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Admin Dashboard
          </a>
          <a
            href="#"
            className="px-6 py-3 border border-border rounded-lg hover:bg-accent transition-colors"
          >
            Learn More
          </a>
        </div>
      </div>
    </main>
  );
}
