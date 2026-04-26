import { RouterProvider } from 'react-router';
import { router } from './routes';
import { DemographyProvider } from './data/DemographyProvider';

export default function App() {
  return (
    <DemographyProvider>
      <RouterProvider router={router} />
    </DemographyProvider>
  );
}
