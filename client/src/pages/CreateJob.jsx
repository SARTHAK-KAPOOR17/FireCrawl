import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Plus, Trash2, ArrowLeft, Info, HelpCircle } from 'lucide-react';

export default function CreateJob() {
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [rawUrls, setRawUrls] = useState('');
  const [selectors, setSelectors] = useState([
    { key: 'title', value: 'h1' },
    { key: 'price', value: '.price' },
  ]);
  const [mode, setMode] = useState('static');
  const [runNow, setRunNow] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Parse and validate URLs on the client
  const { validUrls, invalidCount, totalCount } = useMemo(() => {
    const lines = rawUrls
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const valid = [];
    let invalid = 0;

    for (const line of lines) {
      try {
        const u = new URL(line);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          valid.push(line);
        } else {
          invalid++;
        }
      } catch {
        invalid++;
      }
    }

    return {
      validUrls: valid,
      invalidCount: invalid,
      totalCount: lines.length,
    };
  }, [rawUrls]);

  const handleAddSelector = () => {
    setSelectors([...selectors, { key: '', value: '' }]);
  };

  const handleRemoveSelector = (index) => {
    if (selectors.length <= 1) {
      toast.error('You must define at least one selector.');
      return;
    }
    setSelectors(selectors.filter((_, i) => i !== index));
  };

  const handleSelectorChange = (index, field, value) => {
    const updated = [...selectors];
    updated[index][field] = value;
    setSelectors(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!name.trim()) {
      errors.name = 'Job name is required';
    }

    if (validUrls.length === 0) {
      errors.urls = 'You must provide at least one valid http or https URL';
    } else if (validUrls.length > 500) {
      errors.urls = 'Maximum of 500 URLs allowed per job';
    }

    // Build selectors object
    const selectorsObj = {};
    for (const { key, value } of selectors) {
      if (!key.trim() || !value.trim()) {
        errors.selectors = 'All field names and selectors must be non-empty';
        break;
      }
      selectorsObj[key.trim()] = value.trim();
    }

    if (Object.keys(selectorsObj).length === 0) {
      errors.selectors = 'Please provide at least 1 valid selector pair';
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        urls: validUrls,
        selectors: selectorsObj,
        mode: 'static',
        runNow,
      };

      const response = await api.post('/jobs', payload);
      toast.success('Job created successfully!');

      const createdJob = response.data?.job;
      if (createdJob?._id) {
        navigate(`/jobs/${createdJob._id}`);
      } else {
        navigate('/jobs');
      }
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Jobs
        </Link>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Create Scraping Job</CardTitle>
            <CardDescription>
              Configure target URLs and CSS selectors for automated extraction.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Job Name */}
            <Input
              label="Job Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Books to Scrape - Catalog"
              error={formErrors.name}
              required
            />

            {/* Target URLs */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="urls-textarea" className="block text-sm font-medium text-slate-700">
                  Target URLs (one per line)
                </label>
                <span
                  className={`text-xs font-medium ${
                    validUrls.length > 500
                      ? 'text-red-600 font-bold'
                      : validUrls.length > 0
                      ? 'text-slate-600'
                      : 'text-slate-400'
                  }`}
                >
                  {validUrls.length} / 500 valid URLs
                  {invalidCount > 0 && (
                    <span className="text-amber-600 ml-1">({invalidCount} invalid)</span>
                  )}
                </span>
              </div>
              <textarea
                id="urls-textarea"
                rows={6}
                value={rawUrls}
                onChange={(e) => setRawUrls(e.target.value)}
                placeholder="https://books.toscrape.com/catalogue/page-1.html&#10;https://books.toscrape.com/catalogue/page-2.html"
                className={`w-full px-3.5 py-2.5 text-sm font-mono bg-white border rounded-lg shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors ${
                  formErrors.urls ? 'border-red-300 ring-1 ring-red-500' : 'border-slate-300'
                }`}
              />
              {formErrors.urls && <p className="text-xs text-red-600 mt-1">{formErrors.urls}</p>}
              <p className="text-xs text-slate-500">
                Enter up to 500 valid http:// or https:// URLs.
              </p>
            </div>

            {/* Selector Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">
                  Field Extraction Rules (Selectors)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSelector}
                  className="text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Field
                </Button>
              </div>

              {/* Selector attribute tip banner */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Attribute Extraction:</strong> Use the{' '}
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">selector@attr</code>{' '}
                  syntax to extract HTML attributes instead of inner text (e.g.{' '}
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">a@href</code> or{' '}
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">img@src</code>).
                </div>
              </div>

              {/* Selector rows */}
              <div className="space-y-2">
                {selectors.map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={item.key}
                        onChange={(e) => handleSelectorChange(index, 'key', e.target.value)}
                        placeholder="Field name (e.g. title)"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={item.value}
                        onChange={(e) => handleSelectorChange(index, 'value', e.target.value)}
                        placeholder="CSS Selector (e.g. h1 or a@href)"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400"
                        required
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveSelector(index)}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2"
                      title="Remove field"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {formErrors.selectors && (
                <p className="text-xs text-red-600 mt-1">{formErrors.selectors}</p>
              )}
            </div>

            {/* Scraping Mode Toggle */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700">Scraping Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="radio"
                    name="mode"
                    value="static"
                    checked={mode === 'static'}
                    onChange={() => setMode('static')}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Static (Fast HTML + Cheerio)</span>
                </label>

                <div className="relative group flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-400 cursor-not-allowed">
                    <input
                      type="radio"
                      name="mode"
                      value="dynamic"
                      disabled
                      className="text-slate-300"
                    />
                    <span>Dynamic (Headless Browser)</span>
                  </label>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Run Immediately Option */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={runNow}
                  onChange={(e) => setRunNow(e.target.checked)}
                  className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-slate-300"
                />
                <span>Trigger scrape run immediately after saving</span>
              </label>
            </div>
          </CardContent>

          <CardFooter>
            <Link to="/jobs">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" variant="primary" loading={loading}>
              Create & Save Job
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
