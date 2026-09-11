import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import { AppProvider } from './store/AppStore'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import BookletForm from './pages/BookletForm'
import Browse from './pages/Browse'
import Detail from './pages/Detail'
import Favorites from './pages/Favorites'
import Settings from './pages/Settings'
import page from './pages/Page.module.css'

const Assembly = lazy(() => import('./assemblies/Assembly'))

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Browse />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/made" element={<Navigate to="/favorites?status=made" replace />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/model/:modelId" element={<Detail />} />
              <Route path="/assembly/:assemblyId" element={<Suspense fallback={<p role="status">つくりかたを よみこんでいるよ…</p>}><Assembly /></Suspense>} />
              <Route path="/booklet/new" element={<BookletForm />} />
              <Route path="/booklet/:entryId" element={<BookletForm />} />
              <Route path="*" element={
                <div className={page.page}>
                  <h1>ページが みつかりません</h1>
                  <Link to="/" className={page.linkButton}>ずかんに もどる</Link>
                </div>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}
