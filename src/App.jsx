import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Layout from './components/Layout'
import OrdersGrid from './components/orders/OrdersGrid'
import InventoryGrid from './components/inventory/InventoryGrid'
import ProductsList from './components/products/ProductsList'
import RecipeGrid from './components/recipes/RecipeGrid'
import RecipeGenerator from './components/recipes/RecipeGenerator'
import AccountsList from './components/accounts/AccountsList'
import PriceGrid from './components/pricing/PriceGrid'
import BakeSchedule from './components/baking/BakeSchedule'
import ImportExport from './components/import-export/ImportExport'
import Dashboard from './components/Dashboard'
import ErrorBoundary from './components/shared/ErrorBoundary'
import SettingsPage from './components/settings/SettingsPage'

function Guarded({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data) setUser(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-screen">Loading...</div>

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login setUser={setUser} />}
        />
        <Route
          path="/"
          element={user ? <Layout user={user} setUser={setUser} /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Guarded><Dashboard /></Guarded>} />
          <Route path="orders"     element={<Guarded><OrdersGrid /></Guarded>} />
          <Route path="inventory"  element={<Guarded><InventoryGrid /></Guarded>} />
          <Route path="products"   element={<Guarded><ProductsList /></Guarded>} />
          <Route path="recipes"    element={<Guarded><RecipeGrid /></Guarded>} />
          <Route path="recipe-gen" element={<Guarded><RecipeGenerator /></Guarded>} />
          <Route path="accounts"   element={<Guarded><AccountsList /></Guarded>} />
          <Route path="pricing"    element={<Guarded><PriceGrid /></Guarded>} />
          <Route path="baking"     element={<Guarded><BakeSchedule /></Guarded>} />
          <Route path="import"     element={<Guarded><ImportExport /></Guarded>} />
          <Route path="settings"   element={<Guarded><SettingsPage /></Guarded>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
