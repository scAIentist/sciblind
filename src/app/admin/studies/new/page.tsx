export default function NewStudy() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <a href="/admin" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
            ← Back to Dashboard
          </a>
          <h1 className="text-4xl font-bold mb-2">Create New Study</h1>
          <p className="text-muted-foreground">
            Set up a new blind comparison study with secure, scientifically rigorous settings
          </p>
        </div>

        <form className="space-y-8 border rounded-lg p-8">
          {/* Basic Information */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Basic Information</h2>

            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-2">
                Study Title *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                placeholder="e.g., Camera Comparison Test 2024"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-2">
                Description *
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Describe the purpose of this study..."
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label htmlFor="prompt" className="block text-sm font-medium mb-2">
                Participant Prompt *
              </label>
              <input
                type="text"
                id="prompt"
                name="prompt"
                placeholder="e.g., Which image has better quality?"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                This question will be shown to participants when voting
              </p>
            </div>
          </div>

          {/* Study Settings */}
          <div className="space-y-4 border-t pt-8">
            <h2 className="text-2xl font-semibold">Study Settings</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="inputType" className="block text-sm font-medium mb-2">
                  Input Type *
                </label>
                <select
                  id="inputType"
                  name="inputType"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="IMAGE">Images</option>
                  <option value="TEXT">Text</option>
                </select>
              </div>

              <div>
                <label htmlFor="rankingMethod" className="block text-sm font-medium mb-2">
                  Ranking Method *
                </label>
                <select
                  id="rankingMethod"
                  name="rankingMethod"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="ELO">Elo Rating (Fast, simple)</option>
                  <option value="BRADLEY_TERRY">Bradley-Terry (Research-grade MLE)</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="comparisons" className="block text-sm font-medium mb-2">
                  Comparisons Per Participant
                </label>
                <input
                  type="number"
                  id="comparisons"
                  name="comparisons"
                  min="10"
                  max="100"
                  defaultValue="20"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Recommended: 20-40 comparisons
                </p>
              </div>

              <div>
                <label htmlFor="targetTopN" className="block text-sm font-medium mb-2">
                  Target Top-N (Optional)
                </label>
                <input
                  type="number"
                  id="targetTopN"
                  name="targetTopN"
                  min="1"
                  placeholder="e.g., 12 for top 12"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-4 border-t pt-8">
            <h2 className="text-2xl font-semibold">Advanced Settings</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="kFactor" className="block text-sm font-medium mb-2">
                  Elo K-Factor
                </label>
                <input
                  type="number"
                  id="kFactor"
                  name="kFactor"
                  min="16"
                  max="64"
                  defaultValue="32"
                  step="0.1"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Higher = faster rating changes
                </p>
              </div>

              <div>
                <label htmlFor="initialRating" className="block text-sm font-medium mb-2">
                  Initial Elo Rating
                </label>
                <input
                  type="number"
                  id="initialRating"
                  name="initialRating"
                  min="1000"
                  max="2000"
                  defaultValue="1500"
                  step="10"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="border-t pt-8">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Security Features Enabled
              </h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>✓ EXIF metadata stripping</li>
                <li>✓ Position bias randomization</li>
                <li>✓ Bot detection & fraud monitoring</li>
                <li>✓ Rate limiting & CAPTCHA protection</li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 border-t pt-8">
            <a
              href="/admin"
              className="px-6 py-2 border rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              disabled
            >
              Create Study (Coming Soon)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
