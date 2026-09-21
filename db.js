const GazaDB = (() => {
  const DB_NAME = 'GazaGalonDB';
  const DB_VERSION = 1;
  const STORES = {
    employeeTransactions: 'employee_transactions',
    directSales: 'direct_sales',
    specialOrders: 'special_orders',
    expenses: 'expenses',
  };

  let databasePromise;

  function open() {
    if (databasePromise) {
      return databasePromise;
    }

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;

        Object.values(STORES).forEach((storeName) => {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, {
              keyPath: 'id',
              autoIncrement: true,
            });
          }
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return databasePromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function add(storeName, value) {
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).add(value);
    return requestResult(request);
  }

  async function get(storeName, id) {
    const database = await open();
    const transaction = database.transaction(storeName, 'readonly');
    return requestResult(transaction.objectStore(storeName).get(id));
  }

  async function getAll(storeName) {
    const database = await open();
    const transaction = database.transaction(storeName, 'readonly');
    return requestResult(transaction.objectStore(storeName).getAll());
  }

  async function update(storeName, value) {
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).put(value);
    return requestResult(request);
  }

  async function remove(storeName, id) {
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).delete(id);
    return requestResult(request);
  }

  return {
    DB_NAME,
    STORES,
    open,
    add,
    get,
    getAll,
    update,
    delete: remove,
  };
})();