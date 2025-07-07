from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import mysql.connector
from typing import List, Optional
from datetime import datetime, date
import os

# Initialize FastAPI app
app = FastAPI(title="Fuel Tracker API",
              description="Backend for Fuel Consumption Tracking System",
              version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Connection
def get_db():
    try:
        db = mysql.connector.connect(
            host="localhost",
            user="root",
            password="root",
            database="fuel_tracker",
            autocommit=True
        )
        return db
    except mysql.connector.Error as err:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {err}"
        )

# Exception Handler
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": f"An error occurred: {str(exc)}"}
    )

# Pydantic Models
class Vehicle(BaseModel):
    id: int
    make: str
    model: str
    year: int
    fuel_type: str

class FuelLogCreate(BaseModel):
    vehicle_id: int
    log_date: date
    fuel_amount: float
    fuel_cost: Optional[float] = None
    odometer: float
    fuel_type: str
    notes: Optional[str] = None

class FuelLog(FuelLogCreate):
    id: int
    efficiency: Optional[float] = None

class TripCreate(BaseModel):
    vehicle_id: int
    trip_date: date
    start_location: str
    end_location: str
    distance: float
    duration: Optional[int] = None
    purpose: str = "commute"
    notes: Optional[str] = None

class Trip(TripCreate):
    id: int
    created_at: Optional[datetime] = None

# API Endpoints
@app.get("/")
def read_root():
    return {
        "message": "Fuel Tracker API is running",
        "endpoints": {
            "vehicles": "/vehicles",
            "fuel_logs": "/fuel_logs",
            "trips": "/trips",
            "analytics": "/analytics/fuel_consumption",
            "frontend": {
                "home": "/index",
                "add_log": "/add-log",
                "trips": "/trips-page",
                "analytics": "/analytics-page"
            }
        }
    }

@app.get("/vehicles", response_model=List[Vehicle])
def get_vehicles(db: mysql.connector.MySQLConnection = Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM vehicles")
    vehicles = cursor.fetchall()
    cursor.close()
    return vehicles

@app.get("/api/vehicles/display")
def get_vehicle_display_names(db: mysql.connector.MySQLConnection = Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT id, CONCAT(make, ' ', model, ' (', year, ')') as display FROM vehicles")
    vehicles = cursor.fetchall()
    cursor.close()
    return vehicles

@app.post("/fuel_logs", response_model=FuelLog)
def create_fuel_log(log: FuelLogCreate, db: mysql.connector.MySQLConnection = Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT odometer FROM fuel_logs 
            WHERE vehicle_id = %s 
            ORDER BY log_date DESC, id DESC LIMIT 1
        """, (log.vehicle_id,))
        prev_log = cursor.fetchone()
        
        efficiency = None
        if prev_log:
            current_odo = float(log.odometer)
            prev_odo = float(prev_log['odometer'])
            distance = current_odo - prev_odo
            if distance > 0:
                efficiency = (float(log.fuel_amount) / distance) * 100
        
        cursor.execute("""
            INSERT INTO fuel_logs 
            (vehicle_id, log_date, fuel_amount, fuel_cost, odometer, fuel_type, notes, efficiency)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            log.vehicle_id, log.log_date, log.fuel_amount, log.fuel_cost,
            log.odometer, log.fuel_type, log.notes, efficiency
        ))
        db.commit()
        
        log_id = cursor.lastrowid
        cursor.execute("SELECT * FROM fuel_logs WHERE id = %s", (log_id,))
        new_log = cursor.fetchone()
        return new_log
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()

@app.get("/fuel_logs", response_model=List[FuelLog])
def get_fuel_logs(vehicle_id: Optional[int] = None, limit: int = 10, 
                 db: mysql.connector.MySQLConnection = Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    try:
        if vehicle_id:
            cursor.execute("""
                SELECT * FROM fuel_logs 
                WHERE vehicle_id = %s 
                ORDER BY log_date DESC, id DESC 
                LIMIT %s
            """, (vehicle_id, limit))
        else:
            cursor.execute("SELECT * FROM fuel_logs ORDER BY log_date DESC, id DESC LIMIT %s", (limit,))
        logs = cursor.fetchall()
        return logs
    finally:
        cursor.close()

@app.post("/trips", response_model=Trip)
def create_trip(trip: TripCreate, db: mysql.connector.MySQLConnection = Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM vehicles WHERE id = %s", (trip.vehicle_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=400, detail="Vehicle does not exist")
        
        cursor.execute("""
            INSERT INTO trips 
            (vehicle_id, trip_date, start_location, end_location, distance, duration, purpose, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            trip.vehicle_id, trip.trip_date, trip.start_location, trip.end_location,
            trip.distance, trip.duration, trip.purpose, trip.notes
        ))
        db.commit()
        
        trip_id = cursor.lastrowid
        cursor.execute("SELECT * FROM trips WHERE id = %s", (trip_id,))
        new_trip = cursor.fetchone()
        return new_trip
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()

@app.get("/trips", response_model=List[Trip])
def get_trips(vehicle_id: Optional[int] = None, limit: int = 10, 
             db: mysql.connector.MySQLConnection = Depends(get_db)):
    cursor = db.cursor(dictionary=True)
    try:
        if vehicle_id:
            cursor.execute("""
                SELECT 
                    id, vehicle_id, trip_date, 
                    start_location, end_location, 
                    distance, duration, 
                    COALESCE(purpose, 'commute') as purpose,
                    notes, created_at
                FROM trips 
                WHERE vehicle_id = %s 
                ORDER BY trip_date DESC, id DESC 
                LIMIT %s
            """, (vehicle_id, limit))
        else:
            cursor.execute("""
                SELECT 
                    id, vehicle_id, trip_date, 
                    start_location, end_location, 
                    distance, duration, 
                    COALESCE(purpose, 'commute') as purpose,
                    notes, created_at
                FROM trips 
                ORDER BY trip_date DESC, id DESC 
                LIMIT %s
            """, (limit,))
        
        trips = cursor.fetchall()
        return trips
    finally:
        cursor.close()

@app.get("/analytics/fuel_consumption")
def get_fuel_consumption(
    vehicle_id: Optional[int] = None, 
    period: str = "30days",
    db: mysql.connector.MySQLConnection = Depends(get_db)
):
    cursor = db.cursor(dictionary=True)
    
    try:
        valid_periods = ["7days", "30days", "3months", "6months", "12months"]
        if period not in valid_periods:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid period. Must be one of: {', '.join(valid_periods)}"
            )

        date_conditions = {
            "7days": "INTERVAL 7 DAY",
            "30days": "INTERVAL 30 DAY",
            "3months": "INTERVAL 3 MONTH",
            "6months": "INTERVAL 6 MONTH",
            "12months": "INTERVAL 12 MONTH"
        }
        date_condition = f"AND log_date >= DATE_SUB(CURDATE(), {date_conditions[period]})"

        query = """
            SELECT 
                DATE_FORMAT(log_date, '%%Y-%%m') AS month,
                SUM(fuel_amount) AS total_fuel,
                AVG(efficiency) AS avg_efficiency
            FROM fuel_logs
            WHERE 1=1 {date_condition}
            {vehicle_filter}
            GROUP BY DATE_FORMAT(log_date, '%%Y-%%m')
            ORDER BY month
        """.format(
            date_condition=date_condition,
            vehicle_filter="AND vehicle_id = %s" if vehicle_id else ""
        )

        params = [vehicle_id] if vehicle_id else []
        cursor.execute(query, params)
        
        result = cursor.fetchall()
        
        for row in result:
            if 'total_fuel' in row and row['total_fuel'] is not None:
                row['total_fuel'] = float(row['total_fuel'])
            if 'avg_efficiency' in row and row['avg_efficiency'] is not None:
                row['avg_efficiency'] = float(row['avg_efficiency'])
        
        return result
        
    except mysql.connector.Error as db_error:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(db_error)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )
    finally:
        cursor.close()

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import os

# Get the current directory where main.py is located
current_dir = Path(__file__).parent

# Serve static files from the current directory
app.mount("/static", StaticFiles(directory=current_dir), name="static")

# Serve HTML files
@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(current_dir, "index.html"))

@app.get("/add-log")
async def serve_add_log():
    return FileResponse(os.path.join(current_dir, "add_log.html"))

@app.get("/trips")
async def serve_trips():
    return FileResponse(os.path.join(current_dir, "trips.html"))

@app.get("/analytics")
async def serve_analytics():
    return FileResponse(os.path.join(current_dir, "analytics.html"))