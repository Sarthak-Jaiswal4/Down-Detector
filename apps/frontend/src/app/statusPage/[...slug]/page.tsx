import PublicPage from '@/components/PublicPage'
import axios from 'axios'
import { BACKEND_URL } from '@/lib/constants'

async function page({ params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params;
    const slugString = Array.isArray(slug) ? slug.join('/') : slug;

    let data = null;
    let error = null;

    try {
        const response = await axios.get(`${BACKEND_URL}/status/${slugString}`);
        data = response.data;
    } catch (e: any) {
        error = e?.response?.data?.message || 'Failed to load status page';
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-6 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center">
                        <svg className="w-8 h-8 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Status Page Not Found</h1>
                    <p className="text-neutral-400 max-w-sm">
                        The status page you&apos;re looking for doesn&apos;t exist or has been removed.
                    </p>
                </div>
            </div>
        );
    }

    return <PublicPage data={data} />;
}

export default page;