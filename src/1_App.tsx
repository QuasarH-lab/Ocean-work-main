/*
File: src\1_App.tsx
Responsible team member: He Linlin
Description: React app root that composes the layout and generator page.
*/
import Layout from './components/1_Layout.tsx';
import Generator from './pages/2_Generator.tsx';

export default function App() {
  return (
    <Layout>
      <Generator />
    </Layout>
  );
}
