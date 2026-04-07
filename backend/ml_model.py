import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

# Modelo de Red Neuronal para Predicción de Riesgo
class ModeloPrediccionRiesgo(nn.Module):
    def __init__(self, input_size=15, hidden_sizes=[128, 64, 32], dropout_rate=0.3):
        super(ModeloPrediccionRiesgo, self).__init__()
        
        layers = []
        prev_size = input_size
        
        for hidden_size in hidden_sizes:
            layers.append(nn.Linear(prev_size, hidden_size))
            layers.append(nn.ReLU())
            layers.append(nn.BatchNorm1d(hidden_size))
            layers.append(nn.Dropout(dropout_rate))
            prev_size = hidden_size
        
        layers.append(nn.Linear(prev_size, 1))
        layers.append(nn.Sigmoid())
        
        self.network = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.network(x)

# Dataset personalizado
class AccidenteDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.FloatTensor(X)
        self.y = torch.FloatTensor(y).reshape(-1, 1)
    
    def __len__(self):
        return len(self.X)
    
    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]

# Función para preparar datos
def preparar_datos(df):
    """
    Prepara los datos de accidentes para el entrenamiento
    """
    # Codificación de variables categóricas
    clima_map = {"soleado": 0, "nublado": 0.5, "lluvia": 1}
    via_map = {"bueno": 0, "regular": 0.5, "malo": 1}
    gravedad_map = {"leve": 0, "grave": 0.5, "fatal": 1}
    vehiculo_map = {"bicicleta": 0, "moto": 0.3, "automovil": 0.5, "bus": 0.7, "camion": 1}
    
    # Características (features)
    features = []
    labels = []
    
    for _, row in df.iterrows():
        # Normalización de coordenadas (Cartagena aproximado)
        lat_norm = (row['latitud'] - 10.3910) / 0.1
        lng_norm = (row['longitud'] + 75.4794) / 0.1
        
        # Características temporales
        hora = row['fecha_hora'].hour / 24
        dia_semana = row['fecha_hora'].weekday() / 7
        mes = row['fecha_hora'].month / 12
        
        # Características de contexto
        clima = clima_map.get(row['clima'], 0.5)
        via = via_map.get(row['estado_via'], 0.5)
        vehiculo = vehiculo_map.get(row['tipo_vehiculo'], 0.5)
        dia_festivo = float(row['dia_festivo'])
        hora_pico = float(row['hora_pico'])
        
        # Características adicionales
        es_fin_semana = float(row['fecha_hora'].weekday() >= 5)
        es_noche = float(row['fecha_hora'].hour >= 19 or row['fecha_hora'].hour <= 6)
        temporada_lluvia = float(row['fecha_hora'].month in [4, 5, 9, 10, 11])
        
        # Interacciones
        lluvia_via_mala = clima * via
        noche_lluvia = es_noche * clima
        
        feature_vector = [
            lat_norm, lng_norm, hora, dia_semana, mes,
            clima, via, vehiculo, dia_festivo, hora_pico,
            es_fin_semana, es_noche, temporada_lluvia,
            lluvia_via_mala, noche_lluvia
        ]
        
        features.append(feature_vector)
        labels.append(gravedad_map.get(row['gravedad'], 0.5))
    
    return np.array(features), np.array(labels)

# Función de entrenamiento
def entrenar_modelo(X_train, y_train, X_val, y_val, epochs=100, batch_size=32, learning_rate=0.001):
    """
    Entrena el modelo de predicción de riesgo
    """
    # Crear datasets y dataloaders
    train_dataset = AccidenteDataset(X_train, y_train)
    val_dataset = AccidenteDataset(X_val, y_val)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    # Inicializar modelo
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    modelo = ModeloPrediccionRiesgo(input_size=15).to(device)
    
    # Loss y optimizador
    criterion = nn.BCELoss()
    optimizer = optim.Adam(modelo.parameters(), lr=learning_rate)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', patience=5, factor=0.5)
    
    # Entrenamiento
    mejor_val_loss = float('inf')
    historial = {'train_loss': [], 'val_loss': [], 'val_accuracy': []}
    
    for epoch in range(epochs):
        # Modo entrenamiento
        modelo.train()
        train_loss = 0
        
        for batch_X, batch_y in train_loader:
            batch_X, batch_y = batch_X.to(device), batch_y.to(device)
            
            optimizer.zero_grad()
            outputs = modelo(batch_X)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item()
        
        train_loss /= len(train_loader)
        
        # Validación
        modelo.eval()
        val_loss = 0
        correct = 0
        total = 0
        
        with torch.no_grad():
            for batch_X, batch_y in val_loader:
                batch_X, batch_y = batch_X.to(device), batch_y.to(device)
                
                outputs = modelo(batch_X)
                loss = criterion(outputs, batch_y)
                val_loss += loss.item()
                
                # Calcular accuracy (usando umbral de 0.5)
                predicted = (outputs > 0.5).float()
                actual = (batch_y > 0.5).float()
                total += batch_y.size(0)
                correct += (predicted == actual).sum().item()
        
        val_loss /= len(val_loader)
        val_accuracy = 100 * correct / total
        
        historial['train_loss'].append(train_loss)
        historial['val_loss'].append(val_loss)
        historial['val_accuracy'].append(val_accuracy)
        
        scheduler.step(val_loss)
        
        if (epoch + 1) % 10 == 0:
            print(f'Epoch [{epoch+1}/{epochs}], Train Loss: {train_loss:.4f}, '
                  f'Val Loss: {val_loss:.4f}, Val Accuracy: {val_accuracy:.2f}%')
        
        # Guardar mejor modelo
        if val_loss < mejor_val_loss:
            mejor_val_loss = val_loss
            torch.save(modelo.state_dict(), 'modelo_riesgo_mejor.pth')
    
    return modelo, historial

# Función principal
def main():
    """
    Pipeline completo de entrenamiento
    """
    # Cargar datos (ejemplo con datos simulados)
    # En producción, cargar desde la base de datos
    print("Generando datos de entrenamiento...")
    
    # Simulación de datos para ejemplo
    np.random.seed(42)
    n_samples = 5000
    
    fechas = pd.date_range(start='2023-01-01', end='2024-12-31', periods=n_samples)
    
    df = pd.DataFrame({
        'latitud': np.random.uniform(10.35, 10.45, n_samples),
        'longitud': np.random.uniform(-75.55, -75.45, n_samples),
        'fecha_hora': fechas,
        'clima': np.random.choice(['soleado', 'nublado', 'lluvia'], n_samples, p=[0.6, 0.25, 0.15]),
        'estado_via': np.random.choice(['bueno', 'regular', 'malo'], n_samples, p=[0.5, 0.3, 0.2]),
        'tipo_vehiculo': np.random.choice(['moto', 'automovil', 'bus', 'camion'], n_samples),
        'gravedad': np.random.choice(['leve', 'grave', 'fatal'], n_samples, p=[0.7, 0.25, 0.05]),
        'dia_festivo': np.random.choice([True, False], n_samples, p=[0.1, 0.9]),
        'hora_pico': np.random.choice([True, False], n_samples, p=[0.3, 0.7])
    })
    
    print(f"Total de muestras: {len(df)}")
    
    # Preparar datos
    print("Preparando features...")
    X, y = preparar_datos(df)
    
    # Split train/validation
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Normalización
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_val = scaler.transform(X_val)
    
    # Guardar scaler
    joblib.dump(scaler, 'scaler.pkl')
    
    print(f"Datos de entrenamiento: {X_train.shape}")
    print(f"Datos de validación: {X_val.shape}")
    
    # Entrenar modelo
    print("\nIniciando entrenamiento...")
    modelo, historial = entrenar_modelo(
        X_train, y_train, X_val, y_val,
        epochs=100,
        batch_size=32,
        learning_rate=0.001
    )
    
    print("\n✅ Entrenamiento completado!")
    print(f"Mejor pérdida de validación: {min(historial['val_loss']):.4f}")
    print(f"Mejor accuracy de validación: {max(historial['val_accuracy']):.2f}%")
    
    # Guardar modelo final
    torch.save(modelo.state_dict(), 'modelo_riesgo_final.pth')
    print("\n📁 Modelos guardados:")
    print("  - modelo_riesgo_mejor.pth")
    print("  - modelo_riesgo_final.pth")
    print("  - scaler.pkl")

if __name__ == "__main__":
    main()