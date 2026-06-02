import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Layout from './components/Layout'
import OrdersGrid from './components/orders/OrdersGrid'
import InventoryGrid from './components/inventory/InventoryGrid'
import RecipeGrid from './components/recipes/RecipeGrid'
import AccountsList from './components/accounts/AccountsList'
import PriceGrid from './components/pricing/PriceGrid'
import BakeSchedule from './components/baking/BakeSchedule'

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
          <Route index element={<Navigate to="/orders" replace />} />
          <Route path="orders" element={<OrdersGrid />} />
          <Route path="inventory" element={<InventoryGrid />} />
          <Route path="recipes" element={<RecipeGrid />} />
          <Route path="accounts" element={<AccountsList />} />
          <Route path="pricing" element={<PriceGrid />} />
          <Route path="baking" element={<BakeSchedule />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
