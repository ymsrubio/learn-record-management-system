import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFound() {
    return (
        <>
            <h1 className="text-[28px] font-bold leading-[34px] tracking-tight">Page not found</h1>
            <Button asChild className="mt-4">
                <Link to="/">Back to Dashboard</Link>
            </Button>
        </>
    );
}
