
import React, { useEffect, useMemo, useState } from "react";
import Auth from "./Auth.jsx";
import { supabase } from "./supabase";
import { QRCodeCanvas } from "qrcode.react";
import {
  Activity, Bell, Check, CheckCheck, ChevronDown, CircleHelp,
  Clock3, CreditCard, Download, LayoutDashboard, LogOut, Menu,
  MoreHorizontal, Plus, QrCode, Search, Settings, ShieldCheck,
  Table2, Users, Utensils, Wallet, X, ArrowUpRight, CircleCheck,
  Timer, Smartphone, ClipboardList, TrendingUp, Filter, Copy,
  RefreshCw, ExternalLink, Package, ShoppingCart, ChefHat,
  Minus, Trash2, Pencil, Eye, EyeOff, ListOrdered
} from "lucide-react";

const STORAGE_KEY = "nexo-v5-state";

const defaultState = {
  restaurant: {
    name: "NEXO Demo",
    subtitle: "Restaurante & Café",
    currency: "USD",
    timezone: "America/Caracas"
  },
  tables: [],
  requests: [],
  staff: [
    { id: 1, name: "Camila", role: "Camarera", active: true },
    { id: 2, name: "Andrés", role: "Camarero", active: true },
    { id: 3, name: "Valentina", role: "Administradora", active: true }
  ],
  settings: {
    sound: true,
    autoAssign: false,
    serviceHours: "09:00 – 22:00"
  }
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState;

    const parsed = JSON.parse(saved);

    return {
      ...defaultState,
      ...parsed,
      restaurant: {
        ...defaultState.restaurant,
        ...(parsed.restaurant || {})
      },
      tables: [],
      requests: [],
      staff: Array.isArray(parsed.staff) ? parsed.staff : defaultState.staff,
      settings: {
        ...defaultState.settings,
        ...(parsed.settings || {})
      }
    };
  } catch {
    return defaultState;
  }
}

const requestTypes = {
  call_waiter: "atencion",
  request_bill: "cuenta",
  place_order: "pedido",
  atencion: "atencion",
  cuenta: "cuenta",
  pedido: "pedido"
};

const databaseRequestTypes = {
  atencion: "call_waiter",
  cuenta: "request_bill",
  pedido: "place_order"
};

const databaseStatuses = {
  pending: "pendiente",
  in_progress: "en proceso",
  completed: "atendida",
  cancelled: "atendida",
  pendiente: "pending",
  "en proceso": "in_progress",
  atendida: "completed"
};

const orderStatuses = {
  pending: "Pendiente",
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado"
};

const orderStatusNext = {
  pending: "preparing",
  preparing: "ready",
  ready: "delivered"
};

const requestLabel = type => ({
  atencion: "Llamar al camarero",
  cuenta: "Solicitar cuenta",
  pedido: "Hacer un pedido"
}[type] || type);

const statusClass = status => String(status || "").replaceAll(" ", "-");

const timeAgo = timestamp => {
  const mins = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (mins < 1) return "Ahora";
  if (mins === 1) return "Hace 1 min";
  return `Hace ${mins} min`;
};

const fmtTime = timestamp =>
  new Date(timestamp).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit"
  });

function money(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "CLP" ? 0 : 2
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function mapTable(row) {
  return {
    id: row.id,
    tableNumber: row.table_number,
    number: Number(row.table_number),
    seats: row.seats || 4,
    zone: row.zone || "Salón",
    status:
      row.status === "occupied" ? "ocupada" :
      row.status === "disabled" ? "deshabilitada" : "libre",
    qrToken: row.qr_token
  };
}

function mapRequest(row) {
  return {
    id: row.id,
    tableId: row.table_id,
    table: row.table_number
      ? Number(row.table_number)
      : Number(row.restaurant_tables?.table_number || 0),
    type: requestTypes[row.request_type] || row.request_type,
    note: row.notes || "",
    status: ({
      pending: "pendiente",
      in_progress: "en proceso",
      completed: "atendida",
      cancelled: "atendida"
    })[row.status] || row.status,
    createdAt: new Date(row.created_at).getTime(),
    assigned: "Equipo"
  };
}
function mapProduct(row) {
  return {
    id: row.id,
    categoryId: row.category_id || row.categoryId,
    name: row.name || "",
    description: row.description || "",
    price: Number(row.price || 0),
    active: row.active !== false
  };
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name || ""
  };
}

function mapOrder(row) {
  const items = (row.order_items || []).map(item => ({
    id: item.id,
    productId: item.product_id,
    name: item.product_name || item.name || item.menu_products?.name || "Producto",
    price: Number(item.unit_price ?? item.price ?? 0),
    quantity: Number(item.quantity || 1),
    subtotal: Number(
      item.subtotal ??
      (Number(item.unit_price ?? item.price ?? 0) * Number(item.quantity || 1))
    )
  }));

  return {
    id: row.id,
    tableId: row.table_id,
    table: Number(row.restaurant_tables?.table_number || row.table_number || 0),
    status: row.status || "pending",
    notes: row.notes || "",
    createdAt: new Date(row.created_at).getTime(),
    items,
    total: Number(row.total ?? items.reduce((sum, item) => sum + item.subtotal, 0))
  };
}

function normalizeCustomerMenu(menuData) {
  let categories = [];
  let products = [];

  if (Array.isArray(menuData)) {
    if (menuData.length && menuData[0]?.categories) {
      categories = menuData[0].categories || [];
      products = menuData[0].products || [];
    } else {
      categories = menuData;
    }
  } else if (menuData && typeof menuData === "object") {
    categories =
      menuData.categories ||
      menuData.menu_categories ||
      [];

    products =
      menuData.products ||
      menuData.menu_products ||
      [];
  }

  return {
    categories: categories.map(item =>
      typeof item === "string"
        ? { id: item, name: item }
        : mapCategory(item)
    ),
    products: products.map(mapProduct)
  };
}

function App() {
  const params = new URLSearchParams(window.location.search);

  const customerMode =
    params.get("vista") === "cliente" ||
    params.has("mesa") ||
    params.has("qr");

  const qrToken = params.get("qr");

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [restaurantError, setRestaurantError] = useState("");

  const [state, setState] = useState(loadState);
  const [page, setPage] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null);

  const [menuCategories, setMenuCategories] = useState([]);
  const [menuProducts, setMenuProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [customerSent, setCustomerSent] = useState(false);
  const [customerType, setCustomerType] = useState("atencion");
  const [customerNote, setCustomerNote] = useState("");
  const [customerTable, setCustomerTable] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [customerMenu, setCustomerMenu] = useState([]);
  const [customerCategories, setCustomerCategories] = useState([]);
  const [customerCart, setCustomerCart] = useState({});
  const [customerOrderSent, setCustomerOrderSent] = useState(false);

  const [newStaff, setNewStaff] = useState({
    name: "",
    role: "Camarero"
  });

  const notify = message => setToast(message);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error(error);

      if (mounted) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const localData = { ...state, tables: [], requests: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
  }, [state]);

  useEffect(() => {
    if (!session?.user?.id) {
      setRestaurantId(null);
      setRestaurantError("");
      setRestaurantLoading(false);
      return;
    }

    let mounted = true;

    async function connectRestaurant() {
      setRestaurantLoading(true);
      setRestaurantError("");

      try {
        const { data, error } = await supabase.rpc(
          "create_restaurant",
          { p_name: state.restaurant.name || "NEXO Demo" }
        );

        if (error) throw error;
        if (!data) throw new Error("No se recibió el ID del restaurante.");

        if (mounted) setRestaurantId(data);
      } catch (error) {
        console.error(error);

        if (mounted) {
          setRestaurantError(
            error.message || "No se pudo conectar el restaurante."
          );
        }
      } finally {
        if (mounted) setRestaurantLoading(false);
      }
    }

    connectRestaurant();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  const loadRestaurantData = async (id, mountedCheck = () => true) => {
    const { data: tables, error: tablesError } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("restaurant_id", id)
      .order("table_number", { ascending: true });

    if (tablesError) throw tablesError;

    let currentTables = tables || [];

    if (!currentTables.length) {
      const initialTables = Array.from({ length: 12 }, (_, i) => ({
        restaurant_id: id,
        table_number: String(i + 1),
        seats: i < 4 ? 2 : i < 9 ? 4 : 6,
        zone: i < 6 ? "Terraza" : "Salón",
        status: "available"
      }));

      const { error } = await supabase
        .from("restaurant_tables")
        .insert(initialTables);

      if (error) throw error;

      const result = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("restaurant_id", id)
        .order("table_number", { ascending: true });

      if (result.error) throw result.error;
      currentTables = result.data || [];
    }

    const { data: requests, error: requestsError } = await supabase
      .from("requests")
      .select(`
        id, restaurant_id, table_id, request_type, status, notes, created_at,
        restaurant_tables ( table_number )
      `)
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false });

    if (requestsError) throw requestsError;

    if (mountedCheck()) {
      setState(current => ({
        ...current,
        tables: currentTables.map(mapTable),
        requests: (requests || []).map(mapRequest)
      }));
    }
  };

  const loadMenuData = async id => {
    const [categoriesResult, productsResult] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("*")
        .eq("restaurant_id", id)
        .order("name"),

      supabase
        .from("menu_products")
        .select("*")
        .eq("restaurant_id", id)
        .order("name")
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (productsResult.error) throw productsResult.error;

    setMenuCategories((categoriesResult.data || []).map(mapCategory));
    setMenuProducts((productsResult.data || []).map(mapProduct));
  };

  const loadOrdersData = async id => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, restaurant_tables(table_number), order_items(*)")
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    setOrders((data || []).map(mapOrder));
  };

  const refreshAll = async id => {
    if (!id) return;

    setDataLoading(true);

    try {
      await Promise.all([
        loadRestaurantData(id),
        loadMenuData(id),
        loadOrdersData(id)
      ]);
    } catch (error) {
      console.error("Error actualizando NEXO:", error);
      notify(error.message || "No se pudieron actualizar los datos.");
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;

    let mounted = true;
    const check = () => mounted;

    async function initialLoad() {
      setDataLoading(true);
      setRestaurantError("");

      try {
        await Promise.all([
          loadRestaurantData(restaurantId, check),
          loadMenuData(restaurantId),
          loadOrdersData(restaurantId)
        ]);
      } catch (error) {
        console.error(error);

        if (mounted) {
          setRestaurantError(
            error.message || "No se pudieron cargar los datos."
          );
        }
      } finally {
        if (mounted) setDataLoading(false);
      }
    }

    initialLoad();

    const channel = supabase
      .channel(`nexo-data-${restaurantId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "requests",
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => loadRestaurantData(restaurantId, check))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "restaurant_tables",
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => loadRestaurantData(restaurantId, check))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "menu_products",
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => loadMenuData(restaurantId))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "menu_categories",
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => loadMenuData(restaurantId))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => loadOrdersData(restaurantId))
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!customerMode) return;

    let mounted = true;

    async function loadCustomerTable() {
      setCustomerLoading(true);
      setCustomerError("");
      setCustomerTable(null);

      try {
        if (!qrToken) {
          throw new Error("No se encontró el código QR de la mesa.");
        }

        const { data, error } = await supabase.rpc(
          "get_customer_table",
          { p_qr_token: qrToken }
        );

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;

        if (!row) {
          throw new Error("No se encontró esta mesa o el QR no está activo.");
        }

        if (mounted) setCustomerTable(mapTable(row));

        const { data: menuData, error: menuError } = await supabase.rpc(
          "get_customer_menu",
          { p_restaurant_id: row.restaurant_id }
        );

        if (menuError) throw menuError;

        if (mounted) {
          const normalized = normalizeCustomerMenu(menuData);
          setCustomerCategories(normalized.categories);
          setCustomerMenu(normalized.products);
        }
      } catch (error) {
        console.error("Error cargando vista cliente:", error);

        if (mounted) {
          setCustomerError(error.message || "No se pudo cargar la mesa.");
        }
      } finally {
        if (mounted) setCustomerLoading(false);
      }
    }

    loadCustomerTable();

    return () => {
      mounted = false;
    };
  }, [customerMode, qrToken]);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = fn => {
    setState(current => fn(structuredClone(current)));
  };

  const activeRequests = state.requests.filter(
    r => r.status !== "atendida"
  );

  const pending = state.requests.filter(
    r => r.status === "pendiente"
  );

  const inProgress = state.requests.filter(
    r => r.status === "en proceso"
  );

  const todayCount = state.requests.length;

  const average = state.requests.length
    ? Math.round(
        state.requests.reduce(
          (sum, r) => sum + Math.max(1, (Date.now() - r.createdAt) / 60000),
          0
        ) / state.requests.length
      )
    : 0;

  const createRequest = async (table, type, note = "") => {
    const selectedTable = state.tables.find(
      t => t.number === Number(table)
    );

    if (!selectedTable) return notify("No se encontró la mesa.");

    try {
      const { error } = await supabase.rpc("create_customer_request", {
        p_qr_token: selectedTable.qrToken,
        p_request_type: databaseRequestTypes[type],
        p_notes: note || requestLabel(type)
      });

      if (error) throw error;

      notify("Solicitud enviada a Supabase.");
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo crear la solicitud.");
    }
  };

  const createStaffAction = async (tableId, action, note = "") => {
    const messages = {
      occupy: "Mesa marcada como ocupada.",
      release: "Mesa liberada.",
      request_bill: "Solicitud de cuenta registrada."
    };

    try {
      const { error } = await supabase.rpc("create_staff_table_action", {
        p_table_id: tableId,
        p_action: action,
        p_notes: note || null
      });

      if (error) throw error;

      notify(messages[action] || "Acción registrada.");
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo ejecutar la acción.");
    }
  };

  const createCustomerRequest = async () => {
    if (!customerTable?.qrToken) {
      setCustomerError("No se encontró el código QR de esta mesa.");
      return;
    }

    try {
      setCustomerLoading(true);
      setCustomerError("");

      const { error } = await supabase.rpc("create_customer_request", {
        p_qr_token: customerTable.qrToken,
        p_request_type: databaseRequestTypes[customerType],
        p_notes: customerNote || requestLabel(customerType)
      });

      if (error) throw error;

      setCustomerSent(true);
    } catch (error) {
      console.error(error);
      setCustomerError(error.message || "No se pudo enviar la solicitud.");
    } finally {
      setCustomerLoading(false);
    }
  };

  const changeRequest = async (id, status) => {
    try {
      const { error } = await supabase
        .from("requests")
        .update({ status: databaseStatuses[status] })
        .eq("id", id)
        .eq("restaurant_id", restaurantId);

      if (error) throw error;

      notify(
        status === "atendida"
          ? "Solicitud atendida."
          : "Solicitud actualizada."
      );
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo actualizar la solicitud.");
    }
  };

  const saveCategory = async name => {
    const cleanName = name.trim();

    if (!cleanName) {
      return notify("Escribe un nombre para la categoría.");
    }

    try {
      const { error } = await supabase
        .from("menu_categories")
        .insert({
          restaurant_id: restaurantId,
          name: cleanName
        });

      if (error) throw error;

      await loadMenuData(restaurantId);
      notify("Categoría creada.");
      setModal(null);
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo crear la categoría.");
    }
  };

  const saveProduct = async product => {
    if (!product.name.trim()) {
      return notify("El nombre del producto es obligatorio.");
    }

    if (!product.categoryId) {
      return notify("Selecciona una categoría.");
    }

    const payload = {
      restaurant_id: restaurantId,
      category_id: product.categoryId,
      name: product.name.trim(),
      description: (product.description || "").trim(),
      price: Number(product.price),
      active: product.active
    };

    if (!Number.isFinite(payload.price) || payload.price < 0) {
      return notify("Introduce un precio válido.");
    }

    try {
      let result;

      if (product.id) {
        result = await supabase
          .from("menu_products")
          .update(payload)
          .eq("id", product.id)
          .eq("restaurant_id", restaurantId);
      } else {
        result = await supabase
          .from("menu_products")
          .insert(payload);
      }

      if (result.error) throw result.error;

      await loadMenuData(restaurantId);
      setModal(null);

      notify(
        product.id
          ? "Producto actualizado."
          : "Producto creado."
      );
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo guardar el producto.");
    }
  };

  const toggleProduct = async product => {
    try {
      const { error } = await supabase
        .from("menu_products")
        .update({ active: !product.active })
        .eq("id", product.id)
        .eq("restaurant_id", restaurantId);

      if (error) throw error;

      await loadMenuData(restaurantId);

      notify(
        product.active
          ? "Producto desactivado."
          : "Producto activado."
      );
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo cambiar el estado.");
    }
  };

  const createOrder = async (tableId, items, notes = "", customer = false) => {
    if (!items.length) {
      throw new Error("Agrega al menos un producto al pedido.");
    }

    const payloadItems = items.map(item => ({
      product_id: item.productId,
      quantity: Number(item.quantity)
    }));

    const rpcName = customer
      ? "create_customer_order"
      : "create_staff_order";

    const args = customer
      ? {
          p_qr_token: customerTable?.qrToken,
          p_items: payloadItems,
          p_notes: notes || ""
        }
      : {
          p_table_id: tableId,
          p_items: payloadItems,
          p_notes: notes || ""
        };

    if (customer && !args.p_qr_token) {
      throw new Error("No se encontró el código QR de esta mesa.");
    }

    const { error } = await supabase.rpc(rpcName, args);

    if (error) throw error;

    if (restaurantId) {
      await loadOrdersData(restaurantId);
    }
  };

  const changeOrderStatus = async (order, nextStatus) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", order.id)
        .eq("restaurant_id", restaurantId);

      if (error) throw error;

      await loadOrdersData(restaurantId);

      notify(
        `Pedido actualizado: ${orderStatuses[nextStatus] || nextStatus}.`
      );
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo actualizar el pedido.");
    }
  };

  const submitCustomerOrder = async () => {
    const items = Object.entries(customerCart)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({
        productId,
        quantity
      }));

    if (!items.length) {
      setCustomerError("Selecciona al menos un producto.");
      return;
    }

    try {
      setCustomerLoading(true);
      setCustomerError("");

      await createOrder(
        customerTable?.id,
        items,
        customerNote,
        true
      );

      setCustomerOrderSent(true);
      setCustomerCart({});
    } catch (error) {
      console.error(error);
      setCustomerError(error.message || "No se pudo enviar el pedido.");
    } finally {
      setCustomerLoading(false);
    }
  };

  if (authLoading && !customerMode) {
    return <LoadingScreen text="Cargando NEXO..." />;
  }

  if (!session && !customerMode) {
    return <Auth onLogin={() => {}} />;
  }

  if (session && restaurantLoading && !customerMode) {
    return <LoadingScreen text="Conectando NEXO con Supabase..." />;
  }

  if (session && restaurantError && !customerMode) {
    return (
      <ErrorScreen
        title="Error al conectar NEXO"
        message={restaurantError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (customerMode) {
    if (customerLoading) {
      return <LoadingScreen text="Cargando mesa y menú..." />;
    }

    if (customerError && !customerTable) {
      return (
        <ErrorScreen
          title="No se pudo abrir la mesa"
          message={customerError}
          onRetry={() => window.location.reload()}
        />
      );
    }

    return (
      <CustomerView
        table={customerTable}
        sent={customerSent}
        setSent={setCustomerSent}
        type={customerType}
        setType={setCustomerType}
        note={customerNote}
        setNote={setCustomerNote}
        onSend={createCustomerRequest}
        loading={customerLoading}
        error={customerError}
        categories={customerCategories}
        products={customerMenu}
        cart={customerCart}
        setCart={setCustomerCart}
        onOrder={submitCustomerOrder}
        orderSent={customerOrderSent}
        setOrderSent={setCustomerOrderSent}
        currency={state.restaurant.currency}
      />
    );
  }

  const nav = [
    { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
    { id: "solicitudes", label: "Solicitudes", icon: Bell, count: pending.length },
    { id: "mesas", label: "Mesas", icon: Table2 },
    { id: "menu", label: "Menú", icon: Utensils },
    {
      id: "pedidos",
      label: "Pedidos",
      icon: ShoppingCart,
      count: orders.filter(o => o.status !== "delivered").length
    },
    { id: "equipo", label: "Equipo", icon: Users },
    { id: "reportes", label: "Reportes", icon: TrendingUp },
    { id: "configuracion", label: "Configuración", icon: Settings }
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <b>NEXO<span>.</span></b>
            <small>RESTAURANT OS</small>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="restaurant-switch">
          <div className="restaurant-avatar">
            <Utensils size={17} />
          </div>
          <div>
            <b>{state.restaurant.name}</b>
            <small>{state.restaurant.subtitle}</small>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-caption">MENÚ PRINCIPAL</div>

        <nav>
          {nav.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => {
                setPage(item.id);
                setMobileNav(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.count > 0 && <em>{item.count}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <b>¿Necesitas ayuda?</b>
            <p>Consulta la guía rápida de NEXO.</p>
            <button onClick={() => notify("Centro de ayuda: próximamente")}>
              Ver ayuda <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="profile">
            <div className="profile-avatar">N</div>
            <div>
              <b>{session?.user?.email || "Administrador"}</b>
              <small>Administrador</small>
            </div>
            <button
              className="icon-button"
              title="Cerrar sesión"
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) notify("No se pudo cerrar la sesión.");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="top-left">
            <button
              className="mobile-menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span>
              <b>{nav.find(n => n.id === page)?.label || "Resumen"}</b>
            </div>
          </div>

          <div className="top-actions">
            <div className="live-indicator">
              <i /> Sistema conectado
            </div>
            <button
              className="icon-button"
              onClick={() => setPage("solicitudes")}
            >
              <Bell size={18} />
              {pending.length > 0 && <i className="notification-dot" />}
            </button>
            <button
              className="icon-button"
              title="Actualizar datos"
              onClick={() => refreshAll(restaurantId)}
              disabled={dataLoading}
            >
              <RefreshCw size={17} />
            </button>
            <div className="top-avatar">N</div>
          </div>
        </header>

        <div className="content">
          {page === "dashboard" && (
            <Dashboard
              state={state}
              pending={pending}
              inProgress={inProgress}
              activeRequests={activeRequests}
              todayCount={todayCount}
              average={average}
              orders={orders}
              setPage={setPage}
              changeRequest={changeRequest}
              notify={notify}
            />
          )}

          {page === "solicitudes" && (
            <Requests
              state={state}
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
              changeRequest={changeRequest}
              notify={notify}
            />
          )}

          {page === "mesas" && (
            <Tables
              state={state}
              setModal={setModal}
              createStaffAction={createStaffAction}
              notify={notify}
              onCreateOrder={table => setModal({ type: "order", table })}
              currency={state.restaurant.currency}
            />
          )}

          {page === "menu" && (
            <MenuPage
              categories={menuCategories}
              products={menuProducts}
              currency={state.restaurant.currency}
              onAddCategory={() => setModal({ type: "category" })}
              onAddProduct={() => setModal({ type: "product" })}
              onEditProduct={product => setModal({ type: "product", product })}
              onToggleProduct={toggleProduct}
            />
          )}

          {page === "pedidos" && (
            <OrdersPage
              orders={orders}
              currency={state.restaurant.currency}
              onChangeStatus={changeOrderStatus}
            />
          )}

          {page === "equipo" && (
            <Team
              state={state}
              setModal={setModal}
              update={update}
              notify={notify}
            />
          )}

          {page === "reportes" && (
            <Reports
              state={state}
              average={average}
              orders={orders}
            />
          )}

          {page === "configuracion" && (
            <SettingsPage
              state={state}
              update={update}
              notify={notify}
            />
          )}
        </div>
      </main>

      {modal && (
        <Modal
          modal={modal}
          setModal={setModal}
          state={state}
          update={update}
          notify={notify}
          newStaff={newStaff}
          setNewStaff={setNewStaff}
          categories={menuCategories}
          onSaveCategory={saveCategory}
          onSaveProduct={saveProduct}
          onCreateOrder={createOrder}
          currency={state.restaurant.currency}
          products={menuProducts}
        />
      )}

      {toast && (
        <div className="toast">
          <CircleCheck size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function LoadingScreen({ text }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#090d18",
      color: "#fff",
      fontSize: "15px"
    }}>
      {text}
    </div>
  );
}

function ErrorScreen({ title, message, onRetry }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#090d18",
      color: "#fff",
      padding: 24
    }}>
      <div style={{ maxWidth: 480 }}>
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onRetry}>Reintentar</button>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, desc, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, delta, icon: Icon, tone = "blue", foot }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className={`stat-icon ${tone}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {delta && <span className="positive">{delta}</span>}
        <span>{foot}</span>
      </div>
    </div>
  );
}

function Dashboard({
  state, pending, inProgress, activeRequests, todayCount,
  average, orders = [], setPage, changeRequest, notify
}) {
  const recent = state.requests.slice(0, 5);
  const occupied = state.tables.filter(t => t.status === "ocupada").length;
  const openOrders = orders.filter(o => o.status !== "delivered").length;

  return (
    <>
      <PageHeading
        eyebrow="CENTRO DE OPERACIONES"
        title="¡Buen día!"
        desc="Aquí tienes el estado de tu restaurante en este momento."
        action={
          <button className="button primary" onClick={() => setPage("mesas")}>
            <Plus size={16} /> Nueva solicitud
          </button>
        }
      />

      <div className="welcome-banner">
        <div className="banner-copy">
          <div className="banner-pill">NEXO INSIGHTS</div>
          <h2>Tu servicio, conectado.</h2>
          <p>
            Gestiona cada solicitud y mantén a tu equipo coordinado
            desde un solo lugar.
          </p>
          <button onClick={() => setPage("solicitudes")}>
            Ver solicitudes <ArrowUpRight size={15} />
          </button>
        </div>

        <div className="banner-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="phone-art">
            <div className="phone-speaker" />
            <div className="phone-screen">
              <div className="phone-logo">N.</div>
              <div className="phone-line" />
              <div className="phone-button"><Bell size={17} /></div>
              <div className="phone-line short" />
            </div>
          </div>
          <div className="float-card">
            <Check size={14} /> Atención confirmada
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Solicitudes pendientes"
          value={pending.length}
          delta="Requieren atención"
          icon={Bell}
          tone="orange"
          foot="Por gestionar"
        />
        <StatCard
          label="En proceso"
          value={inProgress.length}
          icon={Timer}
          tone="purple"
          foot="Atención del equipo"
        />
        <StatCard
          label="Mesas ocupadas"
          value={`${occupied}/${state.tables.length}`}
          icon={Table2}
          tone="blue"
          foot="Mesas con clientes"
        />
        <StatCard
          label="Pedidos activos"
          value={openOrders}
          icon={ShoppingCart}
          tone="green"
          foot="En cocina o por entregar"
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel requests-panel">
          <div className="panel-heading">
            <div>
              <h3>Solicitudes recientes</h3>
              <p>Últimos avisos enviados por tus clientes</p>
            </div>
            <button
              className="text-button"
              onClick={() => setPage("solicitudes")}
            >
              Ver todas <ArrowUpRight size={14} />
            </button>
          </div>

          {recent.length ? (
            <div className="request-list">
              {recent.map(r => (
                <RequestRow
                  key={r.id}
                  request={r}
                  changeRequest={changeRequest}
                />
              ))}
            </div>
          ) : (
            <EmptyState text="Todavía no hay solicitudes." />
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Estado de las mesas</h3>
              <p>Vista general del salón</p>
            </div>
            <button
              className="more-button"
              onClick={() => setPage("mesas")}
            >
              <MoreHorizontal />
            </button>
          </div>

          <div className="occupancy">
            <div className="occupancy-number">
              {Math.round(occupied / Math.max(1, state.tables.length) * 100)}
              <small>%</small>
            </div>
            <div>
              <b>Ocupación / actividad</b>
              <p>{occupied} de {state.tables.length} mesas ocupadas</p>
            </div>
          </div>

          <div className="progress-track">
            <div style={{
              width: `${occupied / Math.max(1, state.tables.length) * 100}%`
            }} />
          </div>

          <div className="legend">
            <span><i className="dot free" /> Libre</span>
            <span><i className="dot busy" /> Ocupada</span>
            <span><i className="dot alert" /> Solicitud</span>
          </div>

          <div className="quick-actions">
            <button onClick={() => setPage("mesas")}>
              <QrCode size={17} /> Ver códigos QR
            </button>
            <button onClick={() => setPage("menu")}>
              <Utensils size={17} /> Gestionar menú
            </button>
          </div>
        </section>
      </div>

      <div className="bottom-note">
        <ShieldCheck size={16} />
        <span>Mesas, solicitudes y pedidos sincronizados con Supabase.</span>
        <button onClick={() => notify("Los datos se consultan desde Supabase.")}>
          Detalles
        </button>
      </div>
    </>
  );
}

function RequestRow({ request, changeRequest }) {
  return (
    <div className="request-row">
      <div className={`request-type-icon ${request.type}`}>
        {request.type === "cuenta"
          ? <CreditCard size={17} />
          : request.type === "pedido"
            ? <Utensils size={17} />
            : <Bell size={17} />}
      </div>

      <div className="request-main">
        <b>
          Mesa {String(request.table).padStart(2, "0")}
          <span> · {requestLabel(request.type)}</span>
        </b>
        <small>
          {request.note} · {timeAgo(request.createdAt)}
        </small>
      </div>

      <StatusPill status={request.status} />

      <div className="request-row-actions">
        {request.status !== "atendida" && (
          <button
            className="tiny-action"
            title="Marcar atendida"
            onClick={() => changeRequest(request.id, "atendida")}
          >
            <Check size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const labels = {
    pendiente: "Pendiente",
    "en proceso": "En proceso",
    atendida: "Atendida"
  };

  return (
    <span className={`status-pill ${statusClass(status)}`}>
      <i /> {labels[status] || status}
    </span>
  );
}

function Requests({
  state, search, setSearch, filter, setFilter, changeRequest, notify
}) {
  const list = state.requests.filter(r =>
    (filter === "todas" || r.status === filter) &&
    `${r.table} ${r.note} ${requestLabel(r.type)} ${r.assigned}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeading
        eyebrow="CENTRO DE OPERACIONES"
        title="Solicitudes"
        desc="Recibe, organiza y resuelve las solicitudes de tus mesas."
        action={
          <button
            className="button secondary"
            onClick={() => notify("Abre la vista cliente desde el QR de una mesa.")}
          >
            <Smartphone size={16} /> Vista cliente
          </button>
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por mesa, tipo o responsable..."
          />
        </div>

        <div className="filter-wrap">
          <Filter size={16} />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="todas">Todas las solicitudes</option>
            <option value="pendiente">Pendientes</option>
            <option value="en proceso">En proceso</option>
            <option value="atendida">Atendidas</option>
          </select>
        </div>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>
              Bandeja de solicitudes
              <span className="count-badge">{list.length}</span>
            </h3>
            <p>Solicitudes almacenadas en Supabase.</p>
          </div>
        </div>

        <div className="data-table">
          <div className="table-head request-table-head">
            <span>MESA / SOLICITUD</span>
            <span>HORA</span>
            <span>RESPONSABLE</span>
            <span>ESTADO</span>
            <span>ACCIÓN</span>
          </div>

          {list.map(r => (
            <div className="table-line request-table-line" key={r.id}>
              <div className="table-request-cell">
                <div className={`request-type-icon ${r.type}`}>
                  {r.type === "cuenta"
                    ? <CreditCard size={16} />
                    : r.type === "pedido"
                      ? <Utensils size={16} />
                      : <Bell size={16} />}
                </div>
                <div>
                  <b>Mesa {String(r.table).padStart(2, "0")}</b>
                  <small>
                    {requestLabel(r.type)}
                    {r.note ? ` · ${r.note}` : ""}
                  </small>
                </div>
              </div>

              <span className="muted-cell">{fmtTime(r.createdAt)}</span>
              <span className="muted-cell">{r.assigned}</span>
              <span><StatusPill status={r.status} /></span>

              <div className="action-cell">
                {r.status === "pendiente" && (
                  <button
                    className="button small secondary"
                    onClick={() => changeRequest(r.id, "en proceso")}
                  >
                    Tomar
                  </button>
                )}

                {r.status === "en proceso" && (
                  <button
                    className="button small primary"
                    onClick={() => changeRequest(r.id, "atendida")}
                  >
                    Resolver
                  </button>
                )}

                {r.status === "atendida" && (
                  <span className="done-label">
                    <CheckCheck size={15} /> Listo
                  </span>
                )}
              </div>
            </div>
          ))}

          {!list.length && (
            <EmptyState text="No encontramos solicitudes con estos filtros." />
          )}
        </div>
      </section>
    </>
  );
}

function Tables({
  state, setModal, createStaffAction, notify, onCreateOrder, currency
}) {
  const [zone, setZone] = useState("Todas");
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const tables = state.tables.filter(
    t => zone === "Todas" || t.zone === zone
  );

  const table = state.tables.find(t => t.id === selected);

  const qrUrl = table?.qrToken
    ? `${window.location.origin}${window.location.pathname}?qr=${encodeURIComponent(table.qrToken)}`
    : "";

  const tableRequests = state.requests.filter(
    r => r.tableId === selected && r.status !== "atendida"
  );

  const disabled = table?.status === "deshabilitada";
  const occupied = table?.status === "ocupada";

  const runTableAction = async action => {
    if (!table || actionLoading || disabled) return;

    setActionLoading(true);

    try {
      await createStaffAction(table.id, action);
    } finally {
      setActionLoading(false);
    }
  };

  const downloadQR = () => {
    if (!qrUrl) {
      return notify("Esta mesa no tiene un código QR disponible.");
    }

    const canvas = document.getElementById(`qr-table-${table.number}`);

    if (!canvas) {
      return notify("No se pudo generar el QR.");
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `nexo-mesa-${table.number}-qr.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notify("QR descargado.");
  };

  const copyQR = async () => {
    if (!qrUrl) {
      return notify("Esta mesa no tiene un código QR disponible.");
    }

    try {
      await navigator.clipboard.writeText(qrUrl);
      notify("Enlace QR copiado.");
    } catch {
      notify("No se pudo copiar el enlace QR.");
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="DISTRIBUCIÓN DEL RESTAURANTE"
        title="Gestión de mesas"
        desc="Consulta el estado de cada mesa y gestiona su servicio."
        action={
          <button
            className="button primary"
            onClick={() => notify("La creación de mesas se habilitará próximamente.")}
          >
            <Plus size={16} /> Agregar mesa
          </button>
        }
      />

      <div className="toolbar">
        <div className="zone-tabs">
          {["Todas", "Terraza", "Salón", "Barra"].map(z => (
            <button
              key={z}
              className={zone === z ? "selected" : ""}
              onClick={() => setZone(z)}
            >
              {z}
            </button>
          ))}
        </div>

        <div className="legend">
          <span><i className="dot free" /> Libre</span>
          <span><i className="dot busy" /> Ocupada</span>
          <span><i className="dot alert" /> Solicitud</span>
        </div>
      </div>

      <div className="tables-layout">
        <section className="tables-grid">
          {tables.map(t => (
            <button
              key={t.id}
              className={`table-card ${
                t.status === "libre"
                  ? "libre"
                  : t.status === "deshabilitada"
                    ? "deshabilitada"
                    : "ocupada"
              } ${selected === t.id ? "chosen" : ""}`}
              onClick={() => setSelected(t.id)}
            >
              <div className="table-card-top">
                <span>{t.zone}</span>
                <MoreHorizontal size={16} />
              </div>

              <div className="table-illustration">
                <div className="chair c1" />
                <div className="chair c2" />
                <div className="chair c3" />
                <div className="chair c4" />
                <div className="table-circle">
                  {String(t.number).padStart(2, "0")}
                </div>
              </div>

              <b>Mesa {String(t.number).padStart(2, "0")}</b>
              <small>{t.seats} personas</small>

              <span className={`table-status ${t.status}`}>
                {t.status === "libre"
                  ? "Disponible"
                  : t.status === "deshabilitada"
                    ? "Deshabilitada"
                    : "Ocupada"}
              </span>
            </button>
          ))}
        </section>

        <aside className="panel table-detail">
          {table ? (
            <>
              <div className="detail-head">
                <div>
                  <div className="eyebrow">DETALLE DE MESA</div>
                  <h3>Mesa {String(table.number).padStart(2, "0")}</h3>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setSelected(null)}
                >
                  <X size={17} />
                </button>
              </div>

              <div className="detail-facts">
                <div>
                  <small>Zona</small>
                  <b>{table.zone}</b>
                </div>
                <div>
                  <small>Capacidad</small>
                  <b>{table.seats} personas</b>
                </div>
                <div>
                  <small>Estado</small>
                  <b>
                    {table.status === "libre"
                      ? "Disponible"
                      : table.status === "deshabilitada"
                        ? "Deshabilitada"
                        : "Ocupada"}
                  </b>
                </div>
              </div>

              <div className="table-staff-actions">
                <div className="eyebrow">ACCIONES DEL PERSONAL</div>

                {disabled ? (
                  <p>Esta mesa está deshabilitada.</p>
                ) : (
                  <>
                    {!occupied && (
                      <button
                        className="button primary full"
                        disabled={actionLoading}
                        onClick={() => runTableAction("occupy")}
                      >
                        <Check size={16} /> Marcar como ocupada
                      </button>
                    )}

                    <button
                      className="button secondary full"
                      onClick={() => onCreateOrder(table)}
                    >
                      <Utensils size={16} /> Registrar pedido
                    </button>

                    <button
                      className="button secondary full"
                      disabled={actionLoading}
                      onClick={() => runTableAction("request_bill")}
                    >
                      <Wallet size={16} /> Solicitar cuenta
                    </button>

                    <button
                      className="button secondary full"
                      disabled={actionLoading}
                      onClick={() => {
                        if (window.confirm(
                          `¿Confirmas que deseas liberar la mesa ${table.number}?`
                        )) {
                          runTableAction("release");
                        }
                      }}
                    >
                      <CheckCheck size={16} /> Liberar mesa
                    </button>
                  </>
                )}
              </div>

              <div className="qr-preview">
                {qrUrl ? (
                  <QRCodeCanvas
                    id={`qr-table-${table.number}`}
                    value={qrUrl}
                    size={200}
                    level="H"
                    includeMargin
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                ) : (
                  <div style={{ padding: 24 }}>
                    <QrCode size={68} />
                    <p>QR no disponible</p>
                  </div>
                )}

                <b>QR de Mesa {table.number}</b>
                <small>
                  Escanea para consultar el menú y solicitar atención
                </small>
              </div>

              <button
                className="button secondary full"
                onClick={downloadQR}
              >
                <Download size={15} /> Descargar QR PNG
              </button>

              <button
                className="button primary full"
                onClick={copyQR}
              >
                <Copy size={15} /> Copiar enlace QR
              </button>

              <button
                className="button secondary full"
                onClick={() => qrUrl && window.open(
                  qrUrl,
                  "_blank",
                  "noopener,noreferrer"
                )}
              >
                Abrir vista cliente <ExternalLink size={14} />
              </button>

              <div className="detail-requests">
                <b>Solicitudes abiertas ({tableRequests.length})</b>

                {tableRequests.length ? (
                  tableRequests.map(r => (
                    <div key={r.id} className="mini-request">
                      <span>{requestLabel(r.type)}</span>
                      <StatusPill status={r.status} />
                    </div>
                  ))
                ) : (
                  <p>No hay solicitudes abiertas.</p>
                )}
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <Table2 size={30} />
              <b>Selecciona una mesa</b>
              <p>
                Consulta sus detalles, estado y enlace de acceso QR.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function MenuPage({
  categories, products, currency, onAddCategory,
  onAddProduct, onEditProduct, onToggleProduct
}) {
  const [category, setCategory] = useState("todas");
  const [search, setSearch] = useState("");

  const visible = products.filter(product =>
    (category === "todas" || product.categoryId === category) &&
    `${product.name} ${product.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const categoryName = id =>
    categories.find(c => c.id === id)?.name || "Sin categoría";

  return (
    <>
      <PageHeading
        eyebrow="CARTA DEL RESTAURANTE"
        title="Menú y productos"
        desc="Administra los productos que tus clientes podrán consultar desde el código QR."
        action={
          <>
            <button className="button secondary" onClick={onAddCategory}>
              <Plus size={15} /> Categoría
            </button>
            <button className="button primary" onClick={onAddProduct}>
              <Plus size={16} /> Nuevo producto
            </button>
          </>
        }
      />

      <div className="stats-grid">
        <StatCard
          label="Productos"
          value={products.length}
          icon={Package}
          tone="blue"
          foot="Registrados"
        />
        <StatCard
          label="Activos"
          value={products.filter(p => p.active).length}
          icon={Eye}
          tone="green"
          foot="Visibles para clientes"
        />
        <StatCard
          label="Categorías"
          value={categories.length}
          icon={ClipboardList}
          tone="purple"
          foot="En tu carta"
        />
        <StatCard
          label="Desactivados"
          value={products.filter(p => !p.active).length}
          icon={EyeOff}
          tone="orange"
          foot="No visibles en el QR"
        />
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar productos..."
          />
        </div>

        <div className="zone-tabs">
          <button
            className={category === "todas" ? "selected" : ""}
            onClick={() => setCategory("todas")}
          >
            Todos
          </button>

          {categories.map(c => (
            <button
              key={c.id}
              className={category === c.id ? "selected" : ""}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>
              Catálogo de productos
              <span className="count-badge">{visible.length}</span>
            </h3>
            <p>Los productos activos aparecerán en el menú del cliente.</p>
          </div>
        </div>

        {visible.length ? (
          <div className="data-table">
            <div className="table-head product-table-head">
              <span>PRODUCTO</span>
              <span>CATEGORÍA</span>
              <span>PRECIO</span>
              <span>ESTADO</span>
              <span>ACCIONES</span>
            </div>

            {visible.map(product => (
              <div className="table-line product-table-line" key={product.id}>
                <div className="table-request-cell">
                  <div className="request-type-icon pedido">
                    <Utensils size={16} />
                  </div>
                  <div>
                    <b>{product.name}</b>
                    <small>{product.description || "Sin descripción"}</small>
                  </div>
                </div>

                <span className="muted-cell">
                  {categoryName(product.categoryId)}
                </span>

                <b>{money(product.price, currency)}</b>

                <span>
                  <StatusPill status={product.active ? "atendida" : "pendiente"} />
                </span>

                <div className="action-cell">
                  <button
                    className="tiny-action"
                    title="Editar"
                    onClick={() => onEditProduct(product)}
                  >
                    <Pencil size={15} />
                  </button>

                  <button
                    className="tiny-action"
                    title={product.active ? "Desactivar" : "Activar"}
                    onClick={() => onToggleProduct(product)}
                  >
                    {product.active
                      ? <EyeOff size={15} />
                      : <Eye size={15} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="Todavía no hay productos. Agrega una categoría y crea tu primer producto." />
        )}
      </section>
    </>
  );
}

function OrdersPage({ orders, currency, onChangeStatus }) {
  const [filter, setFilter] = useState("all");

  const visible = orders.filter(
    order => filter === "all" || order.status === filter
  );

  const totalSales = orders.reduce(
    (sum, order) => sum + order.total,
    0
  );

  return (
    <>
      <PageHeading
        eyebrow="OPERACIÓN Y COCINA"
        title="Pedidos"
        desc="Consulta los pedidos recibidos desde el QR y los registrados por el personal."
      />

      <div className="stats-grid">
        <StatCard
          label="Pedidos registrados"
          value={orders.length}
          icon={ShoppingCart}
          tone="blue"
          foot="Total histórico"
        />
        <StatCard
          label="Pendientes"
          value={orders.filter(o => o.status === "pending").length}
          icon={Clock3}
          tone="orange"
          foot="Por preparar"
        />
        <StatCard
          label="En preparación"
          value={orders.filter(o => o.status === "preparing").length}
          icon={ChefHat}
          tone="purple"
          foot="En cocina"
        />
        <StatCard
          label="Total registrado"
          value={money(totalSales, currency)}
          icon={Wallet}
          tone="green"
          foot="Suma de pedidos"
        />
      </div>

      <div className="toolbar">
        <div className="zone-tabs">
          {[
            ["all", "Todos"],
            ["pending", "Pendientes"],
            ["preparing", "Preparando"],
            ["ready", "Listos"],
            ["delivered", "Entregados"]
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="orders-list">
        {visible.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            currency={currency}
            onChangeStatus={onChangeStatus}
          />
        ))}

        {!visible.length && (
          <section className="panel">
            <EmptyState text="No hay pedidos para este filtro." />
          </section>
        )}
      </div>
    </>
  );
}

function OrderCard({ order, currency, onChangeStatus }) {
  const next = orderStatusNext[order.status];

  return (
    <section className="panel order-card">
      <div className="panel-heading">
        <div>
          <h3>
            Pedido · Mesa {String(order.table).padStart(2, "0")}
          </h3>
          <p>
            {fmtTime(order.createdAt)} · {order.items.length} productos
          </p>
        </div>

        <span className={`order-status ${order.status}`}>
          {orderStatuses[order.status] || order.status}
        </span>
      </div>

      <div className="order-items">
        {order.items.map((item, index) => (
          <div
            className="order-item"
            key={item.id || `${item.productId}-${index}`}
          >
            <span>
              <b>{item.quantity} ×</b> {item.name}
            </span>
            <b>{money(item.subtotal, currency)}</b>
          </div>
        ))}
      </div>

      {order.notes && (
        <p className="order-notes">Nota: {order.notes}</p>
      )}

      <div className="order-footer">
        <div>
          <small>Total</small>
          <strong>{money(order.total, currency)}</strong>
        </div>

        {next && (
          <button
            className="button primary"
            onClick={() => onChangeStatus(order, next)}
          >
            {next === "preparing"
              ? "Comenzar preparación"
              : next === "ready"
                ? "Marcar como listo"
                : "Marcar entregado"}
            <ArrowUpRight size={15} />
          </button>
        )}

        {order.status === "delivered" && (
          <span className="done-label">
            <CheckCheck size={15} /> Pedido entregado
          </span>
        )}
      </div>
    </section>
  );
}

function Team({ state, setModal, update, notify }) {
  return (
    <>
      <PageHeading
        eyebrow="PERSONAS Y OPERACIÓN"
        title="Equipo de trabajo"
        desc="Administra a las personas que participan en la atención."
        action={
          <button
            className="button primary"
            onClick={() => setModal({ type: "staff" })}
          >
            <Plus size={16} /> Agregar persona
          </button>
        }
      />

      <div className="stats-grid team-stats">
        <StatCard
          label="Personas registradas"
          value={state.staff.length}
          icon={Users}
          tone="blue"
          foot="Equipo total"
        />
        <StatCard
          label="Activas"
          value={state.staff.filter(s => s.active).length}
          icon={CircleCheck}
          tone="green"
          foot="Disponibles"
        />
        <StatCard
          label="Roles"
          value={new Set(state.staff.map(s => s.role)).size}
          icon={ShieldCheck}
          tone="purple"
          foot="Perfiles configurados"
        />
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>Mi equipo</h3>
            <p>Equipo local de demostración.</p>
          </div>
        </div>

        <div className="team-list">
          {state.staff.map((person, i) => (
            <div className="team-row" key={person.id}>
              <div className={`person-avatar avatar-${i % 4}`}>
                {person.name
                  .split(" ")
                  .map(n => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>

              <div className="person-info">
                <b>{person.name}</b>
                <small>{person.role}</small>
              </div>

              <span className={`person-status ${person.active ? "active" : ""}`}>
                <i />
                {person.active ? "Activo" : "Inactivo"}
              </span>

              <button
                className="button small secondary"
                onClick={() => {
                  update(s => {
                    const p = s.staff.find(x => x.id === person.id);
                    if (p) p.active = !p.active;
                    return s;
                  });

                  notify("Estado del equipo actualizado.");
                }}
              >
                {person.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Reports({ state, average, orders = [] }) {
  const done = state.requests.filter(
    r => r.status === "atendida"
  ).length;

  const total = state.requests.length;

  const byType = ["atencion", "cuenta", "pedido"].map(type => ({
    type,
    count: state.requests.filter(r => r.type === type).length
  }));

  const max = Math.max(1, ...byType.map(x => x.count));

  const orderTotal = orders.reduce(
    (sum, order) => sum + order.total,
    0
  );

  return (
    <>
      <PageHeading
        eyebrow="ANÁLISIS DEL SERVICIO"
        title="Reportes"
        desc="Indicadores de la actividad registrada en Supabase."
        action={
          <button
            className="button secondary"
            onClick={() => {
              const rows = [
                "id,mesa,tipo,estado,hora",
                ...state.requests.map(
                  r => `${r.id},${r.table},${r.type},${r.status},${fmtTime(r.createdAt)}`
                )
              ].join("\n");

              const a = document.createElement("a");
              a.href = URL.createObjectURL(
                new Blob([rows], { type: "text/csv" })
              );
              a.download = "nexo-reporte.csv";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Download size={16} /> Exportar CSV
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard
          label="Solicitudes totales"
          value={total}
          icon={ClipboardList}
          tone="blue"
          foot="Registros en Supabase"
        />
        <StatCard
          label="Solicitudes resueltas"
          value={done}
          icon={CheckCheck}
          tone="green"
          foot="Marcadas atendidas"
        />
        <StatCard
          label="Pedidos registrados"
          value={orders.length}
          icon={ShoppingCart}
          tone="purple"
          foot="Pedidos totales"
        />
        <StatCard
          label="Ventas registradas"
          value={money(orderTotal, state.restaurant.currency)}
          icon={Wallet}
          tone="orange"
          foot="Suma de pedidos"
        />
      </div>

      <div className="reports-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Solicitudes por tipo</h3>
              <p>Distribución de los registros actuales</p>
            </div>
          </div>

          <div className="bar-chart">
            {byType.map(item => (
              <div className="bar-row" key={item.type}>
                <div className="bar-label">
                  <span>{requestLabel(item.type)}</span>
                  <b>{item.count}</b>
                </div>
                <div className="bar-track">
                  <div style={{
                    width: `${item.count / max * 100}%`
                  }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel report-summary">
          <div className="panel-heading">
            <div>
              <h3>Estado del servicio</h3>
              <p>Resolución de solicitudes</p>
            </div>
          </div>

          <div
            className="donut"
            style={{
              "--progress": `${total ? done / total * 100 : 0}%`
            }}
          >
            <div>
              <b>{total ? Math.round(done / total * 100) : 0}%</b>
              <small>Resueltas</small>
            </div>
          </div>

          <p className="report-caption">
            {done} de {total} solicitudes marcadas como atendidas.
          </p>
        </section>
      </div>
    </>
  );
}

function SettingsPage({ state, update, notify }) {
  const [name, setName] = useState(state.restaurant.name);

  useEffect(() => {
    setName(state.restaurant.name);
  }, [state.restaurant.name]);

  return (
    <>
      <PageHeading
        eyebrow="PERSONALIZACIÓN"
        title="Configuración"
        desc="Ajusta los datos principales del espacio de trabajo."
      />

      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h3>Información del restaurante</h3>
              <p>Estos datos identifican tu espacio de trabajo.</p>
            </div>
          </div>

          <label className="field-label">
            Nombre comercial
            <input
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>

          <label className="field-label">
            Tipo de negocio
            <input
              value={state.restaurant.subtitle}
              onChange={e => update(s => {
                s.restaurant.subtitle = e.target.value;
                return s;
              })}
            />
          </label>

          <label className="field-label">
            Moneda
            <select
              value={state.restaurant.currency}
              onChange={e => update(s => {
                s.restaurant.currency = e.target.value;
                return s;
              })}
            >
              <option value="USD">USD — Dólar estadounidense</option>
              <option value="VES">VES — Bolívar</option>
              <option value="CLP">CLP — Peso chileno</option>
            </select>
          </label>

          <button
            className="button primary"
            onClick={() => {
              const cleanName = name.trim();

              if (!cleanName) {
                return notify("El nombre comercial no puede estar vacío.");
              }

              update(s => {
                s.restaurant.name = cleanName;
                return s;
              });

              notify("Configuración guardada.");
            }}
          >
            Guardar cambios
          </button>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h3>Preferencias de operación</h3>
              <p>Opciones locales de esta demostración.</p>
            </div>
          </div>

          <ToggleRow
            title="Sonido de notificaciones"
            desc="Preferencia local de notificaciones."
            value={state.settings.sound}
            onChange={v => update(s => {
              s.settings.sound = v;
              return s;
            })}
          />

          <ToggleRow
            title="Asignación automática"
            desc="Preferencia local para asignar solicitudes."
            value={state.settings.autoAssign}
            onChange={v => update(s => {
              s.settings.autoAssign = v;
              return s;
            })}
          />

          <div className="service-hours">
            <Clock3 size={17} />
            <div>
              <b>Horario de servicio</b>
              <small>{state.settings.serviceHours}</small>
            </div>
          </div>
        </section>

        <section className="panel danger-zone">
          <div className="panel-heading">
            <div>
              <h3>Zona de mantenimiento</h3>
              <p>Acciones sobre las preferencias locales.</p>
            </div>
          </div>

          <button
            className="button danger"
            onClick={() => {
              if (confirm("¿Seguro que deseas restaurar las preferencias locales?")) {
                localStorage.removeItem(STORAGE_KEY);
                window.location.reload();
              }
            }}
          >
            <RefreshCw size={15} /> Restaurar preferencias
          </button>

          <small>
            Esta acción no elimina los datos almacenados en Supabase.
          </small>
        </section>
      </div>
    </>
  );
}

function ToggleRow({ title, desc, value, onChange }) {
  return (
    <div className="toggle-row">
      <div>
        <b>{title}</b>
        <p>{desc}</p>
      </div>
      <button
        className={`toggle ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
        aria-label={title}
      >
        <i />
      </button>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <ClipboardList size={26} />
      <p>{text}</p>
    </div>
  );
}

function Modal({
  modal, setModal, state, update, notify, newStaff, setNewStaff,
  categories, onSaveCategory, onSaveProduct, onCreateOrder,
  currency, products
}) {
  const [categoryName, setCategoryName] = useState("");

  const [product, setProduct] = useState(() =>
    modal.product
      ? {
          ...modal.product,
          categoryId: modal.product.categoryId || "",
          price: String(modal.product.price)
        }
      : {
          id: null,
          name: "",
          description: "",
          price: "",
          categoryId: categories[0]?.id || "",
          active: true
        }
  );

  const [cart, setCart] = useState({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedTable = modal.table;

  const cartItems = Object.entries(cart).filter(
    ([, qty]) => qty > 0
  );

  const cartTotal = cartItems.reduce((sum, [id, qty]) => {
    const p = products.find(item => item.id === id);
    return sum + Number(p?.price || 0) * qty;
  }, 0);

  const setQty = (id, qty) => {
    setCart(current => ({
      ...current,
      [id]: Math.max(0, qty)
    }));
  };

  const submitStaffOrder = async () => {
    if (!cartItems.length) {
      return notify("Agrega productos al pedido.");
    }

    setSaving(true);

    try {
      await onCreateOrder(
        selectedTable.id,
        cartItems.map(([productId, quantity]) => ({
          productId,
          quantity
        })),
        notes,
        false
      );

      setModal(null);
      notify("Pedido registrado correctamente.");
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo registrar el pedido.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) setModal(null);
      }}
    >
      <div className={`modal ${modal.type === "order" ? "modal-wide" : ""}`}>
        <div className="modal-head">
          <h3>
            {modal.type === "staff"
              ? "Agregar persona"
              : modal.type === "category"
                ? "Nueva categoría"
                : modal.type === "product"
                  ? (modal.product ? "Editar producto" : "Nuevo producto")
                  : `Pedido · Mesa ${selectedTable?.number}`}
          </h3>

          <button
            className="icon-button"
            onClick={() => setModal(null)}
          >
            <X size={18} />
          </button>
        </div>

        {modal.type === "staff" && (
          <>
            <label className="field-label">
              Nombre
              <input
                value={newStaff.name}
                onChange={e => setNewStaff({
                  ...newStaff,
                  name: e.target.value
                })}
                placeholder="Nombre y apellido"
              />
            </label>

            <label className="field-label">
              Rol
              <select
                value={newStaff.role}
                onChange={e => setNewStaff({
                  ...newStaff,
                  role: e.target.value
                })}
              >
                <option>Camarero</option>
                <option>Camarera</option>
                <option>Administradora</option>
                <option>Supervisor</option>
              </select>
            </label>

            <button
              className="button primary full"
              onClick={() => {
                if (!newStaff.name.trim()) return;

                update(s => {
                  s.staff.push({
                    id: Date.now(),
                    name: newStaff.name.trim(),
                    role: newStaff.role,
                    active: true
                  });
                  return s;
                });

                setNewStaff({
                  name: "",
                  role: "Camarero"
                });

                setModal(null);
                notify("Persona agregada al equipo local.");
              }}
            >
              Agregar al equipo
            </button>
          </>
        )}

        {modal.type === "category" && (
          <>
            <label className="field-label">
              Nombre de la categoría
              <input
                value={categoryName}
                onChange={e => setCategoryName(e.target.value)}
                placeholder="Ej. Entradas, Bebidas, Postres"
              />
            </label>

            <button
              className="button primary full"
              onClick={() => onSaveCategory(categoryName)}
            >
              Crear categoría
            </button>
          </>
        )}

        {modal.type === "product" && (
          <>
            <label className="field-label">
              Nombre del producto
              <input
                value={product.name}
                onChange={e => setProduct({
                  ...product,
                  name: e.target.value
                })}
                placeholder="Ej. Hamburguesa clásica"
              />
            </label>

            <label className="field-label">
              Descripción
              <textarea
                rows="3"
                value={product.description}
                onChange={e => setProduct({
                  ...product,
                  description: e.target.value
                })}
                placeholder="Describe el producto..."
              />
            </label>

            <label className="field-label">
              Categoría
              <select
                value={product.categoryId}
                onChange={e => setProduct({
                  ...product,
                  categoryId: e.target.value
                })}
              >
                <option value="">Selecciona una categoría</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Precio
              <input
                type="number"
                min="0"
                step="0.01"
                value={product.price}
                onChange={e => setProduct({
                  ...product,
                  price: e.target.value
                })}
                placeholder="0.00"
              />
            </label>

            <ToggleRow
              title="Producto activo"
              desc="Visible en el menú del cliente."
              value={product.active}
              onChange={v => setProduct({
                ...product,
                active: v
              })}
            />

            <button
              className="button primary full"
              onClick={() => onSaveProduct(product)}
            >
              {product.id ? "Guardar cambios" : "Crear producto"}
            </button>
          </>
        )}

        {modal.type === "order" && (
          <>
            <p className="modal-description">
              Selecciona los productos que pidió el cliente.
            </p>

            <div className="staff-order-products">
              {products.filter(p => p.active).map(p => (
                <div className="staff-order-product" key={p.id}>
                  <div>
                    <b>{p.name}</b>
                    <small>{money(p.price, currency)}</small>
                  </div>

                  <div className="quantity-control">
                    <button
                      onClick={() => setQty(
                        p.id,
                        (cart[p.id] || 0) - 1
                      )}
                    >
                      <Minus size={14} />
                    </button>

                    <b>{cart[p.id] || 0}</b>

                    <button
                      onClick={() => setQty(
                        p.id,
                        (cart[p.id] || 0) + 1
                      )}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {!products.some(p => p.active) && (
                <EmptyState text="No hay productos activos en el menú." />
              )}
            </div>

            <label className="field-label">
              Notas del pedido
              <textarea
                rows="2"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Indicaciones para cocina (opcional)"
              />
            </label>

            <div className="order-modal-total">
              <span>Total</span>
              <b>{money(cartTotal, currency)}</b>
            </div>

            <button
              className="button primary full"
              disabled={saving || !cartItems.length}
              onClick={submitStaffOrder}
            >
              {saving ? "Registrando..." : "Registrar pedido"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CustomerView({
  table, sent, setSent, type, setType, note, setNote, onSend,
  loading, error, categories, products, cart, setCart, onOrder,
  orderSent, setOrderSent, currency
}) {
  const [section, setSection] = useState("menu");
  const [activeCategory, setActiveCategory] = useState("todas");

  const visibleProducts = products.filter(p =>
    p.active &&
    (activeCategory === "todas" || p.categoryId === activeCategory)
  );

  const cartItems = Object.entries(cart).filter(
    ([, qty]) => qty > 0
  );

  const total = cartItems.reduce((sum, [id, qty]) => {
    const p = products.find(item => item.id === id);
    return sum + Number(p?.price || 0) * qty;
  }, 0);

  const setQty = (id, qty) => {
    setCart(current => ({
      ...current,
      [id]: Math.max(0, qty)
    }));
  };

  return (
    <div className="customer-page">
      <div className="customer-top">
        <div className="brand-mark">N</div>
        <b>NEXO<span>.</span></b>
        <span className="customer-restaurant">
          {table?.zone || "Restaurante"} · Servicio en mesa
        </span>
      </div>

      <div className="customer-card">
        <div className="customer-welcome-icon">
          <Utensils size={23} />
        </div>

        <div className="eyebrow">BIENVENIDO/A</div>
        <h1>Estamos para atenderte.</h1>
        <p>
          Explora nuestro menú y realiza tu pedido directamente desde tu mesa.
        </p>

        <div className="customer-table">
          MESA <b>{String(table?.number || "").padStart(2, "0")}</b>
        </div>

        {orderSent ? (
          <div className="success-panel">
            <div><CheckCheck size={27} /></div>
            <h2>¡Pedido recibido!</h2>
            <p>Tu pedido fue enviado a cocina. Gracias por elegirnos.</p>
            <button
              className="button secondary full"
              onClick={() => {
                setOrderSent(false);
                setSection("menu");
              }}
            >
              Volver al menú
            </button>
          </div>
        ) : sent ? (
          <div className="success-panel">
            <div><CheckCheck size={27} /></div>
            <h2>¡Solicitud enviada!</h2>
            <p>
              El equipo recibió tu aviso. En breve se acercará a tu mesa.
            </p>
            <button
              className="button secondary full"
              onClick={() => {
                setSent(false);
                setNote("");
                setSection("menu");
              }}
            >
              Volver al menú
            </button>
          </div>
        ) : (
          <>
            <div className="customer-nav">
              <button
                className={section === "menu" ? "active" : ""}
                onClick={() => setSection("menu")}
              >
                <Utensils size={16} /> Menú
              </button>

              <button
                className={section === "service" ? "active" : ""}
                onClick={() => setSection("service")}
              >
                <Bell size={16} /> Atención
              </button>
            </div>

            {section === "menu" && (
              <>
                <div className="customer-category-tabs">
                  <button
                    className={activeCategory === "todas" ? "selected" : ""}
                    onClick={() => setActiveCategory("todas")}
                  >
                    Todo
                  </button>

                  {categories.map(c => (
                    <button
                      key={c.id}
                      className={activeCategory === c.id ? "selected" : ""}
                      onClick={() => setActiveCategory(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <div className="customer-product-list">
                  {visibleProducts.map(p => (
                    <div className="customer-product" key={p.id}>
                      <div>
                        <b>{p.name}</b>
                        <p>{p.description}</p>
                        <strong>{money(p.price, currency)}</strong>
                      </div>

                      <div className="quantity-control">
                        <button
                          onClick={() => setQty(
                            p.id,
                            (cart[p.id] || 0) - 1
                          )}
                        >
                          <Minus size={14} />
                        </button>

                        <b>{cart[p.id] || 0}</b>

                        <button
                          onClick={() => setQty(
                            p.id,
                            (cart[p.id] || 0) + 1
                          )}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {!visibleProducts.length && (
                    <EmptyState text="No hay productos disponibles en esta categoría." />
                  )}
                </div>

                {cartItems.length > 0 && (
                  <>
                    <div className="customer-cart-total">
                      <span>
                        {cartItems.reduce(
                          (sum, [, qty]) => sum + qty,
                          0
                        )} productos
                      </span>
                      <b>{money(total, currency)}</b>
                    </div>

                    <label className="field-label customer-note">
                      Indicaciones para tu pedido
                      <textarea
                        rows="2"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Ej. Sin cebolla, salsa aparte..."
                      />
                    </label>

                    {error && (
                      <p className="customer-error">{error}</p>
                    )}

                    <button
                      className="button customer-send full"
                      onClick={onOrder}
                      disabled={loading}
                    >
                      {loading ? "Enviando pedido..." : "Enviar pedido"}
                      <ArrowUpRight size={17} />
                    </button>
                  </>
                )}
              </>
            )}

            {section === "service" && (
              <>
                <div className="customer-options">
                  <button
                    className={type === "atencion" ? "chosen" : ""}
                    onClick={() => setType("atencion")}
                  >
                    <span><Bell size={19} /></span>
                    <b>Llamar al camarero</b>
                    <small>Necesito ayuda o atención</small>
                  </button>

                  <button
                    className={type === "cuenta" ? "chosen" : ""}
                    onClick={() => setType("cuenta")}
                  >
                    <span><Wallet size={19} /></span>
                    <b>Solicitar la cuenta</b>
                    <small>Quiero pagar mi consumo</small>
                  </button>
                </div>

                <label className="field-label customer-note">
                  Mensaje adicional <span>(opcional)</span>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Escribe aquí si necesitas algo específico..."
                    rows="3"
                  />
                </label>

                {error && (
                  <p className="customer-error">{error}</p>
                )}

                <button
                  className="button customer-send full"
                  onClick={onSend}
                  disabled={loading}
                >
                  {loading ? "Enviando..." : "Enviar solicitud"}
                  <ArrowUpRight size={17} />
                </button>
              </>
            )}
          </>
        )}

        <div className="customer-secure">
          <ShieldCheck size={14} />
          Tu solicitud se envía de forma segura al restaurante.
        </div>
      </div>

      <footer>
        Atención conectada por <b>NEXO.</b>
      </footer>
    </div>
  );
}

export default App;
