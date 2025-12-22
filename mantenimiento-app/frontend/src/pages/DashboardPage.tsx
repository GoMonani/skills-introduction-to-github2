import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { DashboardStats } from '../types';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  pendiente: '#f59e0b',
  en_progreso: '#3b82f6',
  esperando_respuesta: '#8b5cf6',
  completado: '#22c55e',
  cancelado: '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  baja: '#64748b',
  media: '#3b82f6',
  alta: '#f97316',
  urgente: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En Progreso',
  esperando_respuesta: 'Esperando',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const PRIORITY_LABELS: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      const result = await apiService.getDashboardStats();
      if (result.success && result.data) {
        setStats(result.data);
      }
      setIsLoading(false);
    };

    loadStats();
  }, []);

  if (isLoading) {
    return (
      <div className="main-content loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <p>No se pudieron cargar las estadísticas</p>
          <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const statusData = Object.entries(stats.byStatus)
    .filter(([_, value]) => value > 0)
    .map(([key, value]) => ({
      name: STATUS_LABELS[key] || key,
      value,
      color: STATUS_COLORS[key] || '#64748b',
    }));

  const priorityData = Object.entries(stats.byPriority)
    .filter(([_, value]) => value > 0)
    .map(([key, value]) => ({
      name: PRIORITY_LABELS[key] || key,
      value,
      color: PRIORITY_COLORS[key] || '#64748b',
    }));

  return (
    <div className="main-content">
      <div className="mb-4">
        <button className="btn btn-outline btn-sm mb-2" onClick={() => navigate('/')}>
          ← Volver
        </button>
        <h1 style={{ fontSize: '1.5rem' }}>Dashboard</h1>
        <p className="text-secondary">Resumen de tus trabajos de mantenimiento</p>
      </div>

      {/* Summary Cards */}
      <div className="dashboard-grid mb-4">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Trabajos Totales</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{stats.averageProgress}%</div>
          <div className="stat-label">Progreso Promedio</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{stats.completedThisMonth}</div>
          <div className="stat-label">Completados este Mes</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{stats.avgCompletionTime}</div>
          <div className="stat-label">Tiempo Promedio</div>
        </div>
      </div>

      {/* Charts */}
      {stats.total > 0 && (
        <>
          {/* Status Distribution */}
          <div className="card mb-4">
            <div className="card-header">
              <strong>Distribución por Estado</strong>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Priority Distribution */}
          <div className="card mb-4">
            <div className="card-header">
              <strong>Distribución por Prioridad</strong>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={priorityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6">
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status Details */}
          <div className="card">
            <div className="card-header">
              <strong>Detalle por Estado</strong>
            </div>
            <div className="card-body">
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <div
                  key={status}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: STATUS_COLORS[status],
                      }}
                    />
                    {STATUS_LABELS[status] || status}
                  </span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {stats.total === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <p className="empty-state-title">No hay datos aún</p>
          <p>Crea tu primer trabajo para ver estadísticas</p>
          <button className="btn btn-primary mt-4" onClick={() => navigate('/nuevo')}>
            Crear Trabajo
          </button>
        </div>
      )}
    </div>
  );
}
